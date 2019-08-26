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
import { FunctionN, Predicate, Lazy, constant, identity } from "fp-ts/lib/function";
import { pipe } from "fp-ts/lib/pipeable";
import * as wave from "waveguide/lib/wave";
import { Wave } from "waveguide/lib/wave";
import * as managed from "waveguide/lib/managed";
import { Managed } from "waveguide/lib/managed";
import * as ref from "waveguide/lib/ref";
import { ConcurrentQueue } from "waveguide/lib/queue";
import * as cq from "waveguide/lib/queue";
import { Sink, collectArraySink, drainSink, drainWhileSink, stepMany, queueSink } from "./sink";
import { isSinkCont, SinkStep, isSinkDone, sinkStepLeftover, sinkStepState } from "./step";
import { ExitTag } from "waveguide/lib/exit";
import { Deferred } from "waveguide/lib/deferred";
import * as deferred from "waveguide/lib/deferred";
import { Monad, Monad2 } from "fp-ts/lib/Monad";

export type Source<E, A> = Wave<E, Option<A>>

export type Fold<E, A> = <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], Wave<E, S>>) => Wave<E, S>

export type Stream<E, A> = Managed<E, Fold<E, A>>;

// The contract of a Stream's fold is that state is preserved within the lifecycle of the managed
// Therefore, we must track the offset in the array via a ref 
// This allows, for instance, this to work with transduce
function arrayFold<E, A>(as: readonly A[]): Managed<E, Fold<E, A>> {
    return managed.encaseWave(wave.map(
        ref.makeRef(0),
        (cell) => {
            return <S>(initial: S, cont: Predicate<S>, f: FunctionN<[S, A], Wave<E, S>>) => {
                function step(current: S): Wave<E, S> {
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

function iteratorSource<A>(iter: Iterator<A>): Source<never, A> {
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

export function fromSource<E, A>(r: Managed<E, Wave<E, Option<A>>>): Stream<E, A> {
    return managed.map(r, (pull) => {
        function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], Wave<E, S>>): Wave<E, S> {
            return cont(initial) ?
                pipe(
                    pull,
                    wave.chainWith((out) =>
                        pipe(
                            out,
                            o.fold(
                                () => wave.pure(initial) as Wave<E, S>,
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
        managed.encaseWave(wave.sync(iter)),
        managed.mapWith(iteratorSource),
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
    function fold<S>(initial: S, cont: Predicate<S>, f: FunctionN<[S, A], Wave<never, S>>): Wave<never, S> {
        return cont(initial) ? f(initial, a) : wave.pure(initial);
    }
    return managed.pure(fold);
}

export function repeatedly<A>(a: A): Stream<never, A> {
    function fold<S>(initial: S, cont: Predicate<S>, f: FunctionN<[S, A], Wave<never, S>>): Wave<never, S> {
        function step(current: S): Wave<never, S> {
            if (cont(current)) {
                return wave.chain(f(current, a), step);
            }
            return wave.pure(current);
        }
        return step(initial);
    }

    return managed.pure(fold);
}

export const empty: Stream<never, never> =
    managed.pure(<S>(initial: S, _cont: Predicate<S>, _f: FunctionN<[S, never], Wave<never, S>>) =>
        wave.pure(initial));

export function raised<E>(e: E): Stream<E, never> {
    return encaseWave(wave.raiseError(e))
}

export function aborted(e: unknown): Stream<never, never> {
    return encaseWave(wave.raiseAbort(e));
}

export function fromOption<A>(opt: Option<A>): Stream<never, A> {
    return pipe(
        opt,
        o.fold(
            constant(empty as Stream<never, A>),
            once
        )
    );
}

export function zipWithIndex<E, A>(stream: Stream<E, A>): Stream<E, readonly [A, number]> {
    const out: Stream<E, readonly [A, number]> = managed.map(
        stream,
        (fold) => {
            function zipFold<S>(initial: S, cont: Predicate<S>, f: FunctionN<[S, readonly [A, number]], Wave<E, S>>): Wave<E, S> {
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

export function concatL<E, A>(stream1: Stream<E, A>, stream2: Lazy<Stream<E, A>>): Stream<E, A> {
    function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], Wave<E, S>>): Wave<E, S> {
        return pipe(
            managed.use(stream1, (fold1) => fold1(initial, cont, step)),
            wave.chainWith(
                intermediate =>
                    cont(intermediate) ?
                        managed.use(stream2(), (fold2) =>
                            fold2(intermediate, cont, step)) :
                        wave.pure(intermediate)
            )
        );
    }
    return managed.pure(fold);
}

export function concat<E, A>(stream1: Stream<E, A>, stream2: Stream<E, A>): Stream<E, A> {
    return concatL(stream1, constant(stream2));
}

export function repeat<E, A>(stream: Stream<E, A>): Stream<E, A> {
    return concatL(stream, () => repeat(stream));
}

export function map<E, A, B>(stream: Stream<E, A>, f: FunctionN<[A], B>): Stream<E, B> {
    return managed.map(stream, (outer) =>
        <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, B], Wave<E, S>>): Wave<E, S> =>
            outer(initial, cont, (s, a) => step(s, f(a)))
    )
}

export function mapWith<A, B>(f: FunctionN<[A], B>): <E>(stream: Stream<E, A>) => Stream<E, B> {
    return (stream) => map(stream, f);
}

export function filter<E, A>(stream: Stream<E, A>, f: Predicate<A>): Stream<E, A> {
    return managed.map(stream, (outer) =>
        <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], Wave<E, S>>): Wave<E, S> =>
            outer(initial, cont, (s, a) => f(a) ? step(s, a) : wave.pure(s))
    );
}

export function filterWith<A>(f: Predicate<A>): <E>(stream: Stream<E, A>) => Stream<E, A> {
    return (stream) => filter(stream, f);
}

export function foldM<E, A, B>(stream: Stream<E, A>, f: FunctionN<[B, A], Wave<E, B>>, seed: B): Stream<E, B> {
    return managed.map(stream, (outer) =>
        <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, B], Wave<E, S>>): Wave<E, S> =>
            cont(initial) ?
                wave.chain(
                    outer(seed, constant(true), (s, a) => f(s, a)),
                    (result) => step(initial, result)
                ) :
                wave.pure(initial)
    );
}

export function fold<E, A, B>(stream: Stream<E, A>, f: FunctionN<[B, A], B>, seed: B): Stream<E, B> {
    return foldM(stream, (b, a) => wave.pure(f(b, a)) as Wave<E, B>, seed);
}

function t2<A, B>(a: A, b: B): readonly [A, B] {
    return [a, b];
}

export function scanM<E, A, B>(stream: Stream<E, A>, f: FunctionN<[B, A], Wave<E, B>>, seed: B): Stream<E, B> {
    return concat(
        once(seed) as Stream<E, B>,
        pipe(
            managed.zip(
                stream,
                managed.encaseWave(ref.makeRef(seed))
            ),
            managed.mapWith(
                ([base, accum]) => {
                    function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, B], Wave<E, S>>): Wave<E, S> {
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
                                            accum.set(s[0]) as Wave<E, S>,
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

export function scan<E, A, B>(stream: Stream<E, A>, f: FunctionN<[B, A], B>, seed: B): Stream<E, B> {
    return scanM(stream, (b, a) => wave.pure(f(b, a)) as Wave<E, B>, seed);
}

export function chain<E, A, B>(stream: Stream<E, A>, f: FunctionN<[A], Stream<E, B>>): Stream<E, B> {
    return managed.map(stream, (outerfold) =>
        <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, B], Wave<E, S>>): Wave<E, S> =>
            outerfold(initial, cont, (s, a) => {
                if (cont(s)) {
                    const inner = f(a);
                    return managed.use(inner, (innerfold) =>
                        innerfold(s, cont, step)
                    )
                }
                return wave.pure(s);
            })
    )
}

export function flatten<E, A>(stream: Stream<E, Stream<E, A>>): Stream<E, A> {
    return chain(stream, identity);
}

export function encaseWave<E, A>(rio: Wave<E, A>): Stream<E, A> {
    function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], Wave<E, S>>): Wave<E, S> {
        if (cont(initial)) {
            return pipe(
                rio,
                wave.chainWith((a) => step(initial, a))
            )
        }
        return wave.pure(initial);
    }
    return managed.pure(fold)
}

export function mapM<E, A, B>(stream: Stream<E, A>, f: FunctionN<[A], Wave<E, B>>): Stream<E, B> {
    return chain(stream, (a) => encaseWave(f(a)));
}

export const never: Stream<never, never> = mapM(once(undefined), constant(wave.never));

type TDuceFused<FoldState, SinkState> = readonly [FoldState, SinkState, boolean]

/**
 * Transduce a stream via a sink.
 * 
 * @param stream 
 * @param sink 
 */
export function transduce<E, A, S, B>(stream: Stream<E, A>, sink: Sink<E, S, A, B>): Stream<E, B> {
    return managed.map(stream, (base) =>
        <S0>(initial: S0, cont: Predicate<S0>, step: FunctionN<[S0, B], Wave<E, S0>>): Wave<E, S0> => {
            function feedSink(foldState: S0, sinkState: S, chunk: A[]): Wave<E, TDuceFused<S0, S>> {
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

export function drop<E, A>(stream: Stream<E, A>, n: number): Stream<E, A> {
    return pipe(
        zipWithIndex(stream),
        filterWith(([_, i]) => i >= n),
        mapWith(([a]) => a)
    )
}

export function dropWith(n: number): <E, A>(stream: Stream<E, A>) => Stream<E, A> {
    return (stream) => drop(stream, n);
}

export function take<E, A>(stream: Stream<E, A>, n: number): Stream<E, A> {
    return managed.map(stream, (fold) =>
        <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], Wave<E, S>>): Wave<E, S> =>
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

export function takeWhile<E, A>(stream: Stream<E, A>, pred: Predicate<A>): Stream<E, A> {
    return managed.map(stream, (fold) =>
        <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], Wave<E, S>>): Wave<E, S> =>
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

export function into<E, A, S, B>(stream: Stream<E, A>, sink: Sink<E, S, A, B>): Wave<E, B> {
    return managed.use(stream, (fold) =>
        pipe(
            sink.initial,
            wave.chainWith((init) =>
                fold(init, isSinkCont, (s, a) => sink.step(s.state, a))),
            wave.mapWith(s => s.state),
            wave.chainWith(sink.extract)
        )
    )
}

export function intoManaged<E, A, S, B>(stream: Stream<E, A>, managedSink: Managed<E, Sink<E, S, A, B>>): Wave<E, B> {
    return managed.use(managedSink, (sink) => into(stream, sink));
}

export function intoLeftover<E, A, S, B>(stream: Stream<E, A>, sink: Sink<E, S, A, B>): Wave<E, readonly [B, readonly A[]]> {
    return managed.use(stream, (fold) =>
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

import * as cio from "waveguide/lib/console";
function sinkQueue<E, A>(stream: Stream<E, A>): Managed<E, readonly [ConcurrentQueue<Option<A>>, Deferred<E, Option<A>>]> {
    return managed.chain(
        managed.zip(
            managed.encaseWave(cq.boundedQueue<Option<A>>(0)),
            managed.encaseWave(deferred.makeDeferred<E, Option<A>>())
        ),
        ([q, latch]) => {
            const write = pipe(
                into(map(stream, some), queueSink(q)),
                wave.result,
                wave.chainWith((e) => {
                    switch (e._tag) {
                        // Waiting on fix for https://github.com/rzeigler/waveguide/issues/14
                        case ExitTag.Abort:
                            return wave.applySecond(
                                cio.error("handling stream aborts not yet implemented", e.abortedWith),
                                wave.raiseAbort("handling stream aborts not yet implemented")
                            );
                        case ExitTag.Raise:
                            return latch.error(e.error);
                        default: // interrupt or done (but interrupt probably doesn't matter)
                            return q.offer(none); // we set the none and allow the consumer to operate no the latch
                    }
                })
            )
            return managed.as(managed.fiber(write), [q, latch] as const)
        }
    )
}

export function zipWith<E, A, B, C>(as: Stream<E, A>, bs: Stream<E, B>, f: FunctionN<[A, B], C>): Stream<E, C> {
    const source = managed.zipWith(sinkQueue(as), sinkQueue(bs), ([aq, alatch], [bq, blatch]) => {
        const atake = pipe(
            aq.take,
            wave.chainTapWith((opt) =>
                pipe(
                    opt,
                    o.fold(
                        // Confirm we have seen the last element
                        () => alatch.done(none),
                        () => wave.unit // just keep going
                    )
                )
            )
        );
        const agrab = wave.raceFirst(atake, alatch.wait);
        const btake = pipe(
            bq.take,
            wave.chainTapWith((opt) =>
                pipe(
                    opt,
                    o.fold(
                        // Confirm we have seen the last element
                        () => blatch.done(none),
                        () => wave.unit // just keep going
                    )
                )
            )
        );
        const bgrab = wave.raceFirst(btake, blatch.wait);

        return wave.zipWith(agrab, bgrab, (aOpt, bOpt) =>
            o.option.chain((aOpt), (a) => 
                o.option.map(bOpt, (b) => f(a, b)))
        )
    })
    return fromSource(source);
}

export function zip<E, A, B>(as: Stream<E, A>, bs: Stream<E, B>): Stream<E, readonly [A, B]> {
    return zipWith(as, bs, (a, b) => [a, b] as const);
}

export function peel<E, A, S, B>(stream: Stream<E, A>, sink: Sink<E, S, A, B>): Stream<E, readonly [B, Stream<E, A>]> {
    const source: Managed<E, Wave<E, Option<A>>> = managed.map(sinkQueue(stream), ([q, latch]) => {
        const take = pipe(
            q.take,
            wave.chainTapWith((opt) =>
                pipe(
                    opt,
                    o.fold(
                        // Confirm we have seen the last element
                        () => latch.done(none),
                        () => wave.unit // just keep going
                    )
                )
            )
        )
        return wave.raceFirst(take, latch.wait);
    });

    return managed.chain(source, (pull) => {
        const pullStream = fromSource<E, A>(managed.pure(pull));
        // We now have a shared pull instantiation that we can use as a sink to drive and return as a stream
        return pipe(
            encaseWave(intoLeftover(pullStream, sink)),
            mapWith(([b, left]) => [b, concat(fromArray(left) as Stream<E, A>, pullStream)] as const)
        )
    });
}

export function peelManaged<E, A, S, B>(stream: Stream<E, A>, managedSink: Managed<E, Sink<E, S, A, B>>): Stream<E, readonly [B, Stream<E, A>]> {
    return managed.chain(managedSink, (sink) => peel(stream, sink));
}

export function dropWhile<E, A>(stream: Stream<E, A>, pred: Predicate<A>): Stream<E, A> {
    return chain(peel(stream, drainWhileSink(pred)),
        ([head, rest]) => concat(fromOption(head) as Stream<E, A>, rest))
}


export function collectArray<E, A>(stream: Stream<E, A>): Wave<E, A[]> {
    return into(stream, collectArraySink());
}

export function drain<E, A>(stream: Stream<E, A>): Wave<E, void> {
    return into(stream, drainSink());
}

export const URI = "Stream";
export type URI = typeof URI;
declare module "fp-ts/lib/HKT" {
    interface URItoKind2<E, A> {
        Stream: Stream<E, A>;
    }
}

export const instances: Monad2<URI> = {
    URI,
    map,
    of: <E, A>(a: A): Stream<E, A> => once(a) as Stream<E, A>,
    ap: <E, A, B>(sfab: Stream<E, FunctionN<[A], B>>, sa: Stream<E, A>) => zipWith(sfab, sa, (f, a) => f(a)),
    chain,
} as const;
