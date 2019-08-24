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

import { Option, some, none } from "fp-ts/lib/Option";
import * as o from "fp-ts/lib/Option";
import { FunctionN, Predicate, Lazy, constant } from "fp-ts/lib/function";
import { pipe } from "fp-ts/lib/pipeable";
import * as wave from "waveguide/lib/io";
import { RIO, DefaultR } from "waveguide/lib/io";
import * as resource from "waveguide/lib/resource";
import { Managed } from "waveguide/lib/resource";
import * as ref from "waveguide/lib/ref";
import { ConcurrentQueue } from "waveguide/lib/queue";
import * as cq from "waveguide/lib/queue";
import { RSink, collectArraySink, drainSink, drainWhileSink, stepMany, queueSink } from "./sink";
import { isSinkCont, SinkStep, isSinkDone, sinkStepLeftover, sinkStepState } from "./step";
import { ExitTag } from "waveguide/lib/exit";
import { Fiber } from "waveguide/lib/fiber";
import { Monad } from "fp-ts/lib/Monad";

export type Source<R, E, A> = RIO<R, E, Option<A>>

export type Fold<R, E, A> = <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R, E, S>>) => RIO<R, E, S>

export type RStream<R, E, A> = Managed<R, E, Fold<R, E, A>>;

export type Stream<E, A> = RStream<DefaultR, E, A>;

// The contract of a Stream's fold is that state is preserved within the lifecycle of the managed
// Therefore, we must track the offset in the array via a ref 
// This allows, for instance, this to work with transduce
function arrayFold<R, E, A>(as: readonly A[]): Managed<R, E, Fold<R, E, A>> {
    return resource.encaseRIO(wave.map(
        ref.makeRef(0),
        (cell) => {
            return <S>(initial: S, cont: Predicate<S>, f: FunctionN<[S, A], RIO<R, E, S>>) => {
                function step(current: S): RIO<R, E, S> {
                    if (cont(current)) {
                        return pipe(
                            cell.modify(i => [i, i + 1] as const), // increment the i
                            wave.chainWith(
                                (i) => {
                                    return i < as.length ?
                                        wave.chain(f(current, as[i]), step) :
                                        wave.pure(current)
                                }
                            )
                        )
                    } else {
                        return wave.pure(current);
                    }
                }
                return step(initial);
            }
        }));
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

function* rangeIterator(start: number, interval?: number, end?: number): Iterator<number> {
    let current = start;
    while (!end || current <= end) {
        yield current;
        current += (interval || 1);
    }
}

export function fromSource<R, E, A>(r: Managed<R, E, RIO<R, E, Option<A>>>): RStream<R, E, A> {
    return resource.map(r, (pull) => {
        function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R, E, S>>): RIO<R, E, S> {
            return cont(initial) ?
                pipe(
                    pull,
                    wave.chainWith((out) =>
                        pipe(
                            out,
                            o.fold(
                                () => wave.pure(initial) as RIO<R, E, S>,
                                (a) => wave.chain(step(initial, a), (next) => fold(next, cont, step))
                            )
                        )
                    )
                ) :
                wave.pure(initial)
        }
        return fold;
    });
}

export function fromArray<A>(as: readonly A[]): Stream<never, A> {
    return arrayFold(as);
}

export function fromIterator<A>(iter: Lazy<Iterator<A>>): Stream<never, A> {
    return pipe(
        resource.encaseRIO(wave.sync(iter)),
        resource.mapWith(iteratorSource),
        fromSource
    );
}

export function fromRange(start: number, interval?: number, end?: number): Stream<never, number> {
    return fromIterator(() => rangeIterator(start, interval, end));
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

export function fromOption<A>(opt: Option<A>): Stream<never, A> {
    return pipe(
        opt,
        o.fold(
            constant(empty as Stream<never, A>),
            once
        )
    );
}

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

export function concatL<R, E, A>(stream1: RStream<R, E, A>, stream2: Lazy<RStream<R, E, A>>): RStream<R, E, A> {
    function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R, E, S>>): RIO<R, E, S> {
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

export function concat<R, E, A>(stream1: RStream<R, E, A>, stream2: RStream<R, E, A>): RStream<R, E, A> {
    return concatL(stream1, constant(stream2));
}

export function repeat<R1, E, A>(stream: RStream<R1, E, A>): RStream<R1, E, A> {
    return concatL(stream, () => repeat(stream));
}

export function map<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[A], B>): RStream<R, E, B> {
    return resource.map(stream, (outer) =>
        <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, B], RIO<R, E, S>>): RIO<R, E, S> =>
            outer(initial, cont, (s, a) => step(s, f(a)))
    )
}

export function mapWith<A, B>(f: FunctionN<[A], B>): <R, E>(stream: RStream<R, E, A>) => RStream<R, E, B> {
    return (stream) => map(stream, f);
}

export function filter<R, E, A>(stream: RStream<R, E, A>, f: Predicate<A>): RStream<R, E, A> {
    return resource.map(stream, (outer) =>
        <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R, E, S>>): RIO<R, E, S> =>
            outer(initial, cont, (s, a) => f(a) ? step(s, a) : wave.pure(s))
    );
}

export function filterWith<A>(f: Predicate<A>): <R, E>(stream: RStream<R, E, A>) => RStream<R, E, A> {
    return (stream) => filter(stream, f);
}

export function foldM<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[B, A], RIO<R, E, B>>, seed: B): RStream<R, E, B> {
    return resource.map(stream, (outer) =>
        <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, B], RIO<R, E, S>>): RIO<R, E, S> =>
            cont(initial) ?
                wave.chain(
                    outer(seed, constant(true), (s, a) => f(s, a)),
                    (result) => step(initial, result)
                ) :
                wave.pure(initial)
    );
}

export function fold<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[B, A], B>, seed: B): RStream<R, E, B> {
    return foldM(stream, (b, a) => wave.pure(f(b, a)) as RIO<R, E, B>, seed);
}

function t2<A, B>(a: A, b: B): readonly [A, B] {
    return [a, b];
}

export function scanM<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[B, A], RIO<R, E, B>>, seed: B): RStream<R, E, B> {
    return concat(
        once(seed) as RStream<R, E, B>,
        pipe(
            resource.zip(
                stream,
                resource.encaseRIO(ref.makeRef(seed))
            ),
            resource.mapWith(
                ([base, accum]) => {
                    function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, B], RIO<R, E, S>>): RIO<R, E, S> {
                        if (cont(initial)) {
                            // We need to figure out how to drive the base fold for a single step
                            // Thus, we switch state from true to false on execution
                            return pipe(
                                accum.get,
                                wave.chainWith(
                                    (b) =>
                                        base(t2(b, true), (s) => s[1], (s, a) =>
                                            wave.map(f(s[0], a), (r) => t2(r, false)))
                                ),
                                wave.chainWith(
                                    // If this is still true, we didn't consume anything so advance
                                    (s) => s[1] ?
                                        wave.pure(initial) :
                                        wave.applySecond(
                                            accum.set(s[0]) as RIO<R, E, S>,
                                            wave.chain(step(initial, s[0]), (next) => fold(next, cont, step))
                                        )
                                )
                            )

                        } else {
                            return wave.pure(initial);
                        }
                    }
                    return fold;
                }
            )
        )
    );
}

export function scan<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[B, A], B>, seed: B): RStream<R, E, B> {
    return scanM(stream, (b, a) => wave.pure(f(b, a)) as RIO<R, E, B>, seed);
}

export function chain<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[A], RStream<R, E, B>>): RStream<R, E, B> {
    return resource.map(stream, (outerfold) =>
        <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, B], RIO<R, E, S>>): RIO<R, E, S> =>
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

export function encase<R, E, A>(rio: RIO<R, E, A>): RStream<R, E, A> {
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

export function mapM<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[A], RIO<R, E, B>>): RStream<R, E, B> {
    return chain(stream, (a) => encase(f(a)));
}

export const never: Stream<never, never> = mapM(once(undefined), constant(wave.never));

type TDuceFused<FoldState, SinkState> = readonly [FoldState, SinkState, boolean]

/**
 * Transduce a stream via a sink.
 * 
 * @param stream 
 * @param sink 
 */
export function transduce<R, E, A, S, B>(stream: RStream<R, E, A>, sink: RSink<R, E, S, A, B>): RStream<R, E, B> {
    return resource.map(stream, (base) =>
        <S0>(initial: S0, cont: Predicate<S0>, step: FunctionN<[S0, B], RIO<R, E, S0>>): RIO<R, E, S0> => {
            function feedSink(foldState: S0, sinkState: S, chunk: A[]): RIO<R, E, TDuceFused<S0, S>> {
                return wave.chain(stepMany(sink, sinkState, chunk), (nextSinkStep) =>
                    isSinkCont(nextSinkStep) ?
                        // We need to let more data in to drive the sink
                        wave.pure([foldState, nextSinkStep.state, true] as const) :
                        // We have a completion, so extract the value and then use it to advance the fold state
                        pipe(
                            sinkStepState(nextSinkStep),
                            sink.extract,
                            wave.chainWith((b) => step(foldState, b)),
                            wave.chainWith((nextFoldState) => {
                                const leftover = sinkStepLeftover(nextSinkStep);
                                // We will re-initialize the sink
                                return pipe(
                                    sink.initial,
                                    wave.chainWith((nextNextSinkState) => {
                                        if (cont(nextFoldState) && leftover.length > 0) {
                                            return feedSink(nextFoldState, nextNextSinkState.state, leftover as A[])
                                        } else {
                                            return wave.pure([nextFoldState, nextNextSinkState.state, false as boolean] as const)
                                        }
                                    })
                                )
                            })
                        )
                )
            }


            const derivedInitial = wave.map(sink.initial, (initSink) => [initial, sinkStepState(initSink), false] as TDuceFused<S0, S>)

            return pipe(
                derivedInitial,
                wave.chainWith((init) => base(init, (s) => cont(s[0]), (s, a) => feedSink(s[0], s[1], [a]))),
                wave.chainWith(
                    ([foldState, sinkState, extract]) =>
                        (extract && cont(foldState) ?
                            wave.chain(sink.extract(sinkState), (b) => step(foldState, b)) :
                            wave.pure(foldState))
                )
            )
        }
    );
}

enum StepTag {
    Value,
    End,
    Error,
    Abort
}

export interface StepValue<E, A> {
    _tag: StepTag.Value;
    a: A;
}

export function stepValue<A>(a: A): Step<never, A> {
    return { _tag: StepTag.Value, a };
}

export interface StepError<E, A> {
    _tag: StepTag.Error;
    e: E;
}

export function stepError<E>(e: E): Step<E, never> {
    return { _tag: StepTag.Error, e };
}

export interface StepAbort<E, A> {
    _tag: StepTag.Abort;
    e: unknown;
}

export function stepAbort(e: unknown): Step<never, never> {
    return { _tag: StepTag.Abort, e };
}

export interface StepEnd<E, A> {
    _tag: StepTag.End;
}

export const stepEnd: Step<never, never> = { _tag: StepTag.End };

export type Step<E, A> = StepValue<E, A> | StepError<E, A> | StepEnd<E, A> | StepAbort<E, A>;

export function drop<R, E, A>(stream: RStream<R, E, A>, n: number): RStream<R, E, A> {
    return pipe(
        zipWithIndex(stream),
        filterWith(([_, i]) => i >= n),
        mapWith(([a]) => a)
    )
}

export function dropWith(n: number): <R, E, A>(stream: RStream<R, E, A>) => RStream<R, E, A> {
    return (stream) => drop(stream, n);
}

export function take<R, E, A>(stream: RStream<R, E, A>, n: number): RStream<R, E, A> {
    return resource.map(stream, (fold) =>
        <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R, E, S>>): RIO<R, E, S> =>
            wave.map(
                fold(
                    t2(initial, 0),
                    (t2s) => t2s[1] < n && cont(t2s[0]),
                    (s, a) => wave.map(step(s[0], a), (next) => t2(next, s[1] + 1))
                ),
                (t2s) => t2s[0]
            )
    );
}

export function takeWhile<R, E, A>(stream: RStream<R, E, A>, pred: Predicate<A>): RStream<R, E, A> {
    return resource.map(stream, (fold) =>
        <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R, E, S>>): RIO<R, E, S> =>
            wave.map(
                fold(
                    t2(initial, true),
                    (t2s) => t2s[1] && cont(t2s[0]),
                    (s, a) =>
                        pred(a) ?
                            wave.map(step(s[0], a), (next) => t2(next, true)) :
                            wave.pure(t2(s[0], false))
                ),
                (t2s) => t2s[0]
            )
    )
}

export function into<R, E, A, S, B>(stream: RStream<R, E, A>, sink: RSink<R, E, S, A, B>): RIO<R, E, B> {
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

export function intoManaged<R, E, A, S, B>(stream: RStream<R, E, A>, managedSink: Managed<R, E, RSink<R, E, S, A, B>>): RIO<R, E, B> {
    return resource.use(managedSink, (sink) => into(stream, sink));
}

export function intoLeftover<R, E, A, S, B>(stream: RStream<R, E, A>, sink: RSink<R, E, S, A, B>): RIO<R, E, readonly [B, readonly A[]]> {
    return resource.use(stream, (fold) =>
        pipe(
            sink.initial,
            wave.chainWith((init) =>
                fold(init, (s) => isSinkCont(s),
                    (s, a) => sink.step(s.state, a))
            ),
            wave.chainWith(
                (end) =>
                    wave.map(
                        sink.extract(end.state),
                        (b) => [b, sinkStepLeftover(end)] as const
                    )
            )
        ));
}

export function peel<R, E, A, S, B>(stream: RStream<R, E, A>, sink: RSink<R, E, S, A, B>): RStream<R, E, readonly [B, RStream<R, E, A>]> {
    // unfortunately, peel doesn't seem to compose nicely with transducers that push back leftovers
    // So, the solution is to run the input stream in the background into a queue to ensure that we get the correct output
    // We must also account for stream errors as well
    // Also, we have to upcast, because contravariance
    const intoQueue: Managed<R, E, ConcurrentQueue<Step<E, A>>> = pipe(
        resource.encaseRIO(cq.boundedQueue<Step<E, A>>(1)),
        resource.chainWith((q) => {
            const writer = into(map(stream, stepValue) as RStream<R, E, Step<E, A>>, queueSink(q));   
            return resource.chain(
                resource.fiber(writer),
                (writerFiber) => {
                    const listener: RIO<R, E, void> = wave.chain(writerFiber.wait, (exit) => {
                        if (exit._tag === ExitTag.Done || exit._tag === ExitTag.Interrupt) {
                            return q.offer(stepEnd);
                        } else if (exit._tag === ExitTag.Raise) {
                            return q.offer(stepError(exit.error));
                        } else {
                            return q.offer(stepAbort(exit.abortedWith));
                        }
                    })
                    return resource.as(resource.fiber(listener), q);
                }
            );
        })
    );

    const source: Managed<R, E, RIO<R, E, Option<A>>> = resource.map(intoQueue, (q) => 
        pipe(
            q.take,
            wave.chainWith((step): RIO<R, E, Option<A>> => {
                if (step._tag === StepTag.Value) {
                    return wave.pure(some(step.a));
                } else if (step._tag === StepTag.End) {
                    return wave.pure(none);
                } else if (step._tag === StepTag.Error) {
                    return wave.raiseError(step.e);
                } else {
                    return wave.raiseAbort(step.e);
                }
            })
        )
    );

    return resource.chain(source, (pull) => {
        const pullStream = fromSource<R, E, A>(resource.pure(pull));
        // We now have a shared pull instantiation that we can use as a sink to drive and return as a stream
        return pipe(
            encase(intoLeftover(pullStream, sink)),
            mapWith(([b, left]) => [b, concat(fromArray(left) as RStream<R, E, A>, pullStream)] as const)
        )
    });
}

export function peelManaged<R, E, A, S, B>(stream: RStream<R, E, A>, managedSink: Managed<R, E, RSink<R, E, S, A, B>>): RStream<R, E, readonly [B, RStream<R, E, A>]> {
    return resource.chain(managedSink, (sink) => peel(stream, sink));
}

export function collectArray<R, E, A>(stream: RStream<R, E, A>): RIO<R, E, A[]> {
    return into(stream, collectArraySink());
}

export function drain<R, E, A>(stream: RStream<R, E, A>): RIO<R, E, void> {
    return into(stream, drainSink());
}
