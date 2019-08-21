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
import * as cio from "waveguide/lib/console";
import { SinkStep, sinkDone, sinkCont, traverse as stepTraverse } from "./step";
import { pipe } from "fp-ts/lib/pipeable";
import { Applicative } from "fp-ts/lib/Applicative";


export interface RSink<R, E, S, A0, A, B> {
    readonly initial: RIO<R, E, SinkStep<A0, S>>;
    step(state: S, next: A): RIO<R, E, SinkStep<A0, S>>;
    extract(step: S): RIO<R, E, B>;
}

export interface SinkPure<S, A0, A, B> {
    readonly initial: SinkStep<A0, S>;
    step(state: S, next: A): SinkStep<A0, S>;
    extract(state: S): B;
}

export type Sink<E, S, A0, A, B> = RSink<DefaultR, E, S, A0, A, B>;

export function liftPureSink<S, A0, A, B>(sink: SinkPure<S, A0, A, B>): Sink<never, S, A0, A, B> {
    return {
        initial: wave.pure(sink.initial),
        step: (state: S, next: A) => wave.pure(sink.step(state, next)),
        extract: flow(sink.extract, wave.pure)
    };
}

export function collectArraySink<R, E, A>(): RSink<R, E, A[], never, A, A[]> {
    const initial =  wave.pure(sinkCont([] as A[]));

    function step(state: A[], next: A): RIO<R, E, SinkStep<never, A[]>> {
        return wave.pure(sinkCont([...state, next]));
    }

    return { initial, extract: wave.pure, step };
}

export function drainSink<R, E, A>(): RSink<R, E, void, never, A, void> {
    const initial = wave.pure(sinkCont(undefined));
    const extract = constant(wave.unit);
    function step(state: void, next: A): RIO<R, E, SinkStep<never, void>> {
        return wave.pure(sinkCont(undefined));
    }
    return { initial, extract, step };
}

export function constSink<R, E, A, B>(b: B): RSink<R, E, void, never, A, B> {
    const initial = wave.pure(sinkDone(undefined as void, none));
    const extract = constant(wave.pure(b));
    function step(state: void, next: A): RIO<R, E, SinkStep<never, void>> {
        return wave.raiseAbort(new Error("constSink step called"));
    }
    return { initial, extract, step };
}

export function headSink<R, E, A>(): RSink<R, E, Option<A>, never, A, Option<A>> {
    const initial = wave.pure(sinkCont(none));

    function step(_state: Option<A>, next: A): RIO<R, E, SinkStep<never, Option<A>>> {
        return wave.pure(sinkDone(some(next), none));
    }
    return { initial, extract: wave.pure, step };
}

export function lastSink<R, E, A>(): RSink<R, E, Option<A>, never, A, Option<A>> {
    const initial = wave.pure(sinkCont(none));

    function step(_state: Option<A>, next: A): RIO<R, E, SinkStep<never, Option<A>>> {
        return wave.pure(sinkCont(some(next)));
    }
    return { initial, extract: wave.pure, step };
}

export function evalSink<R, E, A>(f: FunctionN<[A], RIO<R, E, unknown>>): RSink<R, E, void, never, A, void> {
    const initial = wave.pure(sinkCont(undefined as void));

    function step(_state: void, next: A): RIO<R, E, SinkStep<never, void>> {
        return wave.applySecond(f(next), wave.pure(sinkCont(_state)));
    }

    const extract = constant(wave.unit)

    return { initial, extract, step };
}

export function drainWhileSink<R, E, A>(f: Predicate<A>): RSink<R, E, Option<A>, never, A, Option<A>> {
    const initial = sinkCont(none as Option<A>);
    
    function step(_state: Option<A>, a: A): SinkStep<never, Option<A>> {
        return f(a) ? sinkCont(none) : sinkDone(some(a), none);
    }

    const extract = identity;

    return liftPureSink({ initial, extract, step });
} 

export function map<R, E, S, A0, A, B, C>(sink: RSink<R, E, S, A0, A, B>, f: FunctionN<[B], C>): RSink<R, E, S, A0, A, C> {
    return {
        ...sink,
        extract: flow(sink.extract, wave.mapWith(f))
    }
}

export function chain<R, E, S, A0, A, B, C>(sink: RSink<R, E, S, A0, A, B>, f: FunctionN<[B], RSink<R, E, S, A0, A, C>>): RSink<R, E, S, A0, A, C> {
    const initial = sink.initial;

    throw new Error();
}
