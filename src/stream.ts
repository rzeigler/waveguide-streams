// Copyright 2019 Ryan Zeigler
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Option, some, none, option } from "fp-ts/lib/Option";
import * as o from "fp-ts/lib/Option";
import { FunctionN, Predicate, Lazy, constant } from "fp-ts/lib/function";
import { pipe } from "fp-ts/lib/pipeable";
import { flow } from "fp-ts/lib/function";
import { head as arrayHead } from "fp-ts/lib/Array";
import * as wave from "waveguide/lib/io";
import { RIO, DefaultR } from "waveguide/lib/io";
import * as resource from "waveguide/lib/resource";
import * as ref from "waveguide/lib/ref";
import { Managed } from "waveguide/lib/resource";
import { RSink, collectArraySink, drainSink } from "./sink";
import { isSinkCont, SinkStep, isSinkDone, sinkStepLeftover } from "./step";

export type Source<R, E, A> = RIO<R, E, Option<A>>

export type Fold<R, E, A> = <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R, E, S>>) => RIO<R, E, S>

export type RStream<R, E, A> = Managed<R, E, Fold<R, E, A>>;

export type Stream<E, A> = RStream<DefaultR, E, A>;

function sourceFold<R, E, A>(pull: Source<R, E, A>): Fold<R, E, A> {
    return <S>(initial: S, cont: Predicate<S>, f: FunctionN<[S, A], RIO<R, E, S>>) => {
        function step(current: S): RIO<R, E, S> {
            if (!cont(initial)) {
                return wave.pure(current);
            }
            return pipe(
                pull,
                wave.chainWith((optA) =>
                    pipe(
                        optA,
                        o.fold(
                            () => wave.pure(current) as RIO<R, E, S>,
                            (a) => wave.chain(f(current, a), step)
                        )
                    )
                )
            )
        }
        return step(initial);
    }
}

// The contract of a Stream's fold is that state is preserved within the lifecycle of the managed
// Therefore, we must track the offset in the array via a ref 
// This allows, for instance, this to work with transduce
function arrayFold<R, E, A>(as: readonly A[]): Managed<R, E, Fold<R, E, A>> {
    return resource.encaseRIO(wave.map(
        ref.makeRef(0),
        (cell) => 
            <S>(initial: S, cont: Predicate<S>, f: FunctionN<[S, A], RIO<R, E, S>>) => {
                function step(current: S): RIO<R, E, S> {
                    if (cont(current)) {
                        return pipe(
                            cell.modify(i => [i, i + 1] as const), // increment the i
                            wave.chainWith(
                                (i) => i < as.length ? 
                                    wave.chain(f(current, as[i]), step) : 
                                    wave.pure(current)
                            )
                        )
                    } else {
                        return wave.pure(current);
                    }
                }
                return step(initial);
            }
    ));
}

function iteratorSource<A>(iter: Iterator<A>): Source<DefaultR, never, A> {
    return wave.sync(() => {
        const n = iter.next();
        if (n.done) {
            return none;
        }
        return some(n.value);
    });
}

export function fromSource<R1, R2, E1, E2, A>(r: Managed<R1, E1, RIO<R2, E2, Option<A>>>): RStream<R1 & R2, E1 | E2, A> {
    return resource.map(r, sourceFold) as RStream<R1 & R2, E1 | E2, A>;
}

export function fromArray<A>(as: readonly A[]): Stream<never, A> {
    return arrayFold(as);
}

export function fromIterator<A>(iter: Lazy<Iterator<A>>): Stream<never, A> {
    return pipe(
        resource.encaseRIO(wave.sync(iter)),
        resource.mapWith(iter => sourceFold(iteratorSource(iter)))
    );
}

export function fromIteratorUnsafe<A>(iter: Iterator<A>): Stream<never, A> {
    return fromIterator(() => iter);
}

export function once<A>(a: A): Stream<never, A> {
    function fold<S>(initial: S, cont: Predicate<S>, f: FunctionN<[S, A], RIO<DefaultR, never, S>>): RIO<DefaultR, never, S> {
        return cont(initial) ? f(initial, a) : wave.pure(initial);
    }
    return resource.pure(fold);
}

export function repeatedly<A>(a: A): Stream<never, A> {
    function fold<S>(initial: S, cont: Predicate<S>, f: FunctionN<[S, A], RIO<DefaultR, never, S>>): RIO<DefaultR, never, S> {
        function step(current: S): RIO<DefaultR, never, S> {
            if (cont(current)) {
                return wave.chain(f(current, a), step);
            }
            return wave.pure(current);
        }
        return step(initial);
    }

    return resource.pure(fold);
}

export const empty: Stream<never, never> =
    resource.pure(<S>(initial: S, _cont: Predicate<S>, _f: FunctionN<[S, never], RIO<DefaultR, never, S>>) =>
        wave.pure(initial));

export const never: Stream<never, never> =
    resource.pure(<S>(_initial: S, _cont: Predicate<S>, _f: FunctionN<[S, never], RIO<DefaultR, never, S>>) =>
        wave.never);

export function zipWithIndex<R, E, A>(stream: RStream<R, E, A>): RStream<R, E, readonly [A, number]> {
    const out: RStream<R, E, readonly [A, number]> = resource.map(
        stream,
        (fold) => {
            function zipFold<S>(initial: S, cont: Predicate<S>, f: FunctionN<[S, readonly [A, number]], RIO<R, E, S>>): RIO<R, E, S> {
                const folded = fold<readonly [S, number]>(
                    [initial, 0 as number],
                    (s) => cont(s[0]),
                    ([s, i], a) =>
                        wave.map(f(s, [a, i]), (s) => [s, i + 1]))
                return wave.map(folded, (s) => s[0]);
            }
            return zipFold;
        }
    );
    return out;
}

export function concat<R1, R2, E, A>(stream1: RStream<R1, E, A>, stream2: RStream<R2, E, A>): RStream<R1 & R2, E, A> {
    return concatL(stream1, constant(stream2));
}

export function concatL<R1, R2, E, A>(stream1: RStream<R1, E, A>, stream2: Lazy<RStream<R2, E, A>>): RStream<R1 & R2, E, A> {
    function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R1 & R2, E, S>>): RIO<R1 & R2, E, S> {
        return pipe(
            resource.use(stream1, (fold1) => fold1(initial, cont, step)),
            wave.chainWith(
                intermediate =>
                    cont(intermediate) ?
                        resource.use(stream2(), (fold2) =>
                            fold2(intermediate, cont, step)) :
                        wave.pure(intermediate)
            )
        );
    }
    return resource.pure(fold);
}


export function repeat<R1, E, A>(stream: RStream<R1, E, A>): RStream<R1, E, A> {
    return concatL(stream, () => repeat(stream));
}

export function map<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[A], B>): RStream<R, E, B> {
    function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, B], RIO<R, E, S>>): RIO<R, E, S> {
        return resource.use(stream, (outer) =>
            outer(initial, cont, (s, a) => step(s, f(a)))
        );
    }
    return resource.pure(fold);
}

export function chain<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[A], RStream<R, E, B>>): RStream<R, E, B> {
    function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, B], RIO<R, E, S>>): RIO<R, E, S> {
        return resource.use(stream, (outerfold) =>
            outerfold(initial, cont, (s, a) => {
                if (cont(s)) {
                    const inner = f(a);
                    return resource.use(inner, (innerfold) =>
                        innerfold(s, cont, step)
                    )
                }
                return wave.pure(s);
            })
        )
    }
    return resource.pure(fold);
}

export function encaseRIO<R, E, A>(rio: RIO<R, E, A>): RStream<R, E, A> {
    function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R, E, S>>): RIO<R, E, S> {
        if (cont(initial)) {
            return pipe(
                rio,
                wave.chainWith((a) => step(initial, a))
            )
        }
        return wave.pure(initial);
    }
    return resource.pure(fold)
}

export function mapEncaseRIO<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[A], RIO<R, E, B>>): RStream<R, E, B> {
    return chain(stream, (a) => encaseRIO(f(a)));
}

export function transduce<R, E, A, S, A0 extends A, B>(stream: RStream<R, E, A>, sink: RSink<R, E, S, A0, A, B>): RStream<R, E, B> {
    return pipe(
        resource.zip(
            stream,
            // We want a way of trackign leftover's across sink invocation
            resource.encaseRIO(ref.makeRef(none as Option<SinkStep<A0, S>>))
        ),
        resource.mapWith(([fold, leftover]) => {
            // Initialize state for a transduction step while consuming leftover
            function initialize(option: Option<SinkStep<A0, S>>): RIO<R, E, SinkStep<A0, S>> {
                return pipe(
                    option,
                    o.fold(
                        // If no previous state just run initializer
                        () => sink.initial,
                        (prev) => 
                            pipe(
                                // If previous state run initializer
                                sink.initial,
                                wave.chainWith(
                                    (step) => isSinkDone(step) ? 
                                        wave.pure(step) :
                                        // then, if we have leftovers in the previous state, step the sink once
                                        pipe(
                                            sinkStepLeftover(prev),
                                            o.fold(
                                                () => wave.pure(step),
                                                (l) => sink.step(step.state, l)
                                            )
                                        )
                                )
                            )
                    )
                )
            }

            // if we are continuing then drive the transducer once
            const sinkFold = pipe(
                // Initialize the state against any leftover
                leftover.get, 
                wave.chainWith(initialize),
                // Here we run the fold using the transducer
                // We also track whether we consumed any items
                wave.chainWith(
                    (start) =>
                        fold(
                            [start, false as boolean] as const, 
                            (s) => isSinkCont(s[0]), 
                            (s, a) => 
                                wave.map(
                                    sink.step(s[0].state, a),
                                    (s) => [s, true] as const
                                )
                        )
                ),
                // Given the final state of the transducer we want to try and extract a value
                wave.chainWith(
                    ([end, stepped]) =>
                        wave.applySecond(
                            leftover.set(some(end)),
                            wave.map(
                                sink.extract(end.state),
                                // We should emit the b if we stepped or there are leftovers defined
                                (b) => [b, stepped || o.isSome(sinkStepLeftover(end))] as const
                            )
                        )
                )
            )

            function delegatingFold<S1>(initial: S1, cont: Predicate<S1>, step: FunctionN<[S1, B], RIO<R, E, S1>>): RIO<R, E, S1> {
                if (cont(initial)) {
                    return pipe(
                        sinkFold,
                        wave.chainWith(
                            ([b, emit]) => emit ? 
                                wave.chain(step(initial, b), (next) => delegatingFold(next, cont, step)) :
                                wave.pure(initial)
                        )
                    );
                } else {
                    return wave.pure(initial);
                }
            }
            return delegatingFold;
        })
    );
}

export function into<R, E, A, S, A0, B>(stream: RStream<R, E, A>, sink: RSink<R, E, S, A0, A, B>): RIO<R, E, B> {
    return resource.use(stream, (fold) =>
        pipe(
            sink.initial,
            wave.chainWith((init) =>
                fold(init, isSinkCont, (s, a) => sink.step(s.state, a))),
            wave.mapWith(s => s.state),
            wave.chainWith(sink.extract)
        )
    )
}

export function collectArray<R, E, A>(stream: RStream<R, E, A>): RIO<R, E, A[]> {
    return into(stream, collectArraySink());
}

export function drain<R, E, A>(stream: RStream<R, E, A>): RIO<R, E, void> {
    return into(stream, drainSink());
}

