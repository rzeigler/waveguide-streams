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
import { constant, FunctionN, flow, Predicate, identity } from "fp-ts/lib/function";
import * as wave from "waveguide/lib/io";
import { DefaultR, RIO } from "waveguide/lib/io";
import { SinkStep, sinkDone, sinkCont, isSinkDone } from "./step";
import { ConcurrentQueue } from "waveguide/lib/queue";


export interface RSink<R, E, S, A, B> {
    readonly initial: RIO<R, E, SinkStep<A, S>>;
    step(state: S, next: A): RIO<R, E, SinkStep<A, S>>;
    extract(step: S): RIO<R, E, B>;
}

export interface SinkPure<S, A, B> {
    readonly initial: SinkStep<A, S>;
    step(state: S, next: A): SinkStep<A, S>;
    extract(state: S): B;
}

export type Sink<E, S, A, B> = RSink<DefaultR, E, S, A, B>;

/**
 * Step a sink repeatedly.
 * If the sink completes before consuming all of the input, then the done state will include the ops leftovers 
 * and anything left in the array
 * @param sink 
 * @param multi 
 */
export function stepMany<R, E, S, A, B>(sink: RSink<R, E, S, A, B>, s: S, multi: ReadonlyArray<A>): RIO<R, E, SinkStep<A, S>> {
    function go(current: SinkStep<A, S>, i: number): RIO<R, E, SinkStep<A, S>> {
        if (i === multi.length) {
            return wave.pure(current);
        } else if (isSinkDone(current)) {
            return wave.pure(sinkDone(current.state, current.leftover.concat(multi.slice(i))));
        } else {
            return wave.chain(sink.step(current.state, multi[i]), (next) => go(next, i + 1));
        }
    }
    return go(sinkCont(s), 0);
}

export function liftPureSink<S, A, B>(sink: SinkPure<S, A, B>): Sink<never, S, A, B> {
    return {
        initial: wave.pure(sink.initial),
        step: (state: S, next: A) => wave.pure(sink.step(state, next)),
        extract: flow(sink.extract, wave.pure)
    };
}

export function collectArraySink<R, E, A>(): RSink<R, E, A[], A, A[]> {
    const initial =  wave.pure(sinkCont([] as A[]));

    function step(state: A[], next: A): RIO<R, E, SinkStep<never, A[]>> {
        return wave.pure(sinkCont([...state, next]));
    }

    return { initial, extract: wave.pure, step };
}

export function drainSink<R, E, A>(): RSink<R, E, void, A, void> {
    const initial = wave.pure(sinkCont(undefined));
    const extract = constant(wave.unit);
    function step(_state: void, _next: A): RIO<R, E, SinkStep<never, void>> {
        return wave.pure(sinkCont(undefined));
    }
    return { initial, extract, step };
}

export function constSink<R, E, A, B>(b: B): RSink<R, E, void, A, B> {
    const initial = wave.pure(sinkDone(undefined as void, []));
    const extract = constant(wave.pure(b));
    function step(_state: void, _next: A): RIO<R, E, SinkStep<never, void>> {
        return wave.pure(sinkDone(undefined as void, []));
    }
    return { initial, extract, step };
}

export function headSink<R, E, A>(): RSink<R, E, Option<A>, A, Option<A>> {
    const initial = wave.pure(sinkCont(none));

    function step(_state: Option<A>, next: A): RIO<R, E, SinkStep<never, Option<A>>> {
        return wave.pure(sinkDone(some(next), []));
    }
    return { initial, extract: wave.pure, step };
}

export function lastSink<R, E, A>(): RSink<R, E, Option<A>, A, Option<A>> {
    const initial = wave.pure(sinkCont(none));

    function step(_state: Option<A>, next: A): RIO<R, E, SinkStep<never, Option<A>>> {
        return wave.pure(sinkCont(some(next)));
    }
    return { initial, extract: wave.pure, step };
}

export function evalSink<R, E, A>(f: FunctionN<[A], RIO<R, E, unknown>>): RSink<R, E, void, A, void> {
    const initial = wave.pure(sinkCont(undefined as void));

    function step(_state: void, next: A): RIO<R, E, SinkStep<never, void>> {
        return wave.applySecond(f(next), wave.pure(sinkCont(_state)) as RIO<R, E, SinkStep<never, void>>);
    }

    const extract = constant(wave.unit)

    return { initial, extract, step };
}

export function drainWhileSink<R, E, A>(f: Predicate<A>): RSink<R, E, Option<A>, A, Option<A>> {
    const initial = sinkCont(none as Option<A>);
    
    function step(_state: Option<A>, a: A): SinkStep<never, Option<A>> {
        return f(a) ? sinkCont(none) : sinkDone(some(a), []);
    }

    const extract = identity;

    return liftPureSink({ initial, extract, step });
} 

export function queueSink<R, E, A>(queue: ConcurrentQueue<A>): RSink<R, E, void, A, void> {
    const initial = wave.pure(sinkCont(undefined));

    function step(_state: void, a: A): RIO<R, E, SinkStep<A, void>> {
        return wave.as(queue.offer(a), sinkCont(undefined));
    }

    const extract = constant(wave.unit);
    return { initial, extract, step };
}

export function map<R, E, S, A, B, C>(sink: RSink<R, E, S, A, B>, f: FunctionN<[B], C>): RSink<R, E, S, A, C> {
    return {
        ...sink,
        extract: flow(sink.extract, wave.mapWith(f))
    }
}
