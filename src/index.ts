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
import * as wave from "waveguide/lib/io";
import { RIO, DefaultR } from "waveguide/lib/io";
import * as resource from "waveguide/lib/resource";
import { Managed } from "waveguide/lib/resource";

export type Source<R, E, A> = RIO<R, E, Option<A>>

export type Fold<R, E, A> = <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R, E, S>>) => RIO<R, E, S>

export type RStream<R, E, A> = Managed<R, E, Fold<R, E, A>>;

export type Stream<E, A> = RStream<DefaultR, E, A>;

export enum SinkStepTag { Cont, Done }

export type SinkStep<S, A0> = SinkStepCont<S> | SinkStepDone<S, A0>;

export function sinkCont<S>(s: S): SinkStepCont<S> {
    return { _tag: SinkStepTag.Cont, state: s };
}

export interface SinkStepCont<S> {
    readonly _tag: SinkStepTag.Cont;
    readonly state: S;
}

export function sinkDone<S, A0>(s: S, left: Option<A0>): SinkStepDone<S, A0> {
    return { _tag: SinkStepTag.Done, state: s, leftover: left };
}

export function isSinkCont<S, A0>(s: SinkStep<S, A0>): s is SinkStepCont<S> {
    return s._tag === SinkStepTag.Cont;
}

export function isSinkDone<S, A0>(s: SinkStep<S, A0>): s is SinkStepDone<S, A0> {
    return s._tag === SinkStepTag.Done;
}

export interface SinkStepDone<S, A0> {
    readonly _tag: SinkStepTag.Done;
    readonly state: S;
    readonly leftover: Option<A0>;
}

export interface RSink<R, E, S, A0, A, B> {
    readonly initial: RIO<R, E, S>;
    step(state: S, next: A): RIO<R, E, SinkStep<S, A0>>;
    extract(step: SinkStep<S, A0>): RIO<R, E, B>;
}

export type Sink<E, S, A0, A, B> = RSink<DefaultR, E, S, A0, A, B>;

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
    
function arrayFold<R, E, A>(as: readonly A[]): Fold<R, E, A> {
    return <S>(initial: S, cont: Predicate<S>, f: FunctionN<[S, A], RIO<R, E, S>>) => {
        function step(current: S, i: number): RIO<R, E, S> {
            if (!cont(current) || i === as.length) {
                return wave.pure(current);
            }
            return wave.chain(f(current, as[i]), next => step(next, i + 1));
        }
        return step(initial, 0);
    }
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
    return resource.pure(arrayFold(as));
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
    function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R1 & R2, E, S>>): RIO<R1 & R2, E, S> {
        return pipe(
            resource.use(stream1, (fold1) => fold1(initial, cont, step)),
            wave.chainWith(
                intermediate => 
                    cont(intermediate) ? 
                        resource.use(stream2, (fold2) => 
                            fold2(intermediate, cont, step)) :
                        wave.pure(intermediate) 
            )
        );
    }
    return resource.pure(fold);
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

export function into<R, E, A, S, A0, B>(stream: RStream<R, E, A>, sink: RSink<R, E, S, A0, A, B>): RIO<R, E, B> {
    return resource.use(stream, (fold) => 
        pipe(
            sink.initial,
            wave.chainWith((init) =>
                fold(sinkCont(init) as SinkStep<S, A0>, isSinkCont, (s, a) => sink.step(s.state, a))),
            wave.chainWith(sink.extract)
        )
    )
}


export function collectArraySink<R, E, A>(): RSink<R, E, A[], never, A, A[]> {
    const initial =  wave.pure([] as A[]);

    function extract(step: SinkStep<A[], never>): RIO<R, E, A[]> {
        return wave.pure(step.state);
    }
    
    function step(state: A[], next: A): RIO<R, E, SinkStep<A[], never>> {
        return wave.pure(sinkCont([...state, next]));
    }

    return { initial, extract, step };
}

export function drainSink<R, E, A>(): RSink<R, E, void, never, A, void> {
    const initial = wave.unit;
    const extract = constant(wave.unit);
    function step(state: void, next: A): RIO<R, E, SinkStep<void, never>> {
        return wave.pure(sinkCont(undefined));
    }
    return { initial, extract, step };
}


export function collectArray<R, E, A>(stream: RStream<R, E, A>): RIO<R, E, A[]> {
    return into(stream, collectArraySink());
}

export function drain<R, E, A>(stream: RStream<R, E, A>): RIO<R, E, void> {
    return into(stream, drainSink());
}

