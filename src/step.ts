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

import { HKT, URIS3, HKT3 } from "fp-ts/lib/HKT";
import { Option, none } from "fp-ts/lib/Option";
import { FunctionN } from "fp-ts/lib/function";
import { Applicative, Applicative3 } from "fp-ts/lib/Applicative";

export enum SinkStepTag { Cont, Done }

export type SinkStep<A0, S> = SinkStepCont<S> | SinkStepDone<A0, S>;

export function sinkCont<S>(s: S): SinkStepCont<S> {
    return { _tag: SinkStepTag.Cont, state: s };
}

export interface SinkStepCont<S> {
    readonly _tag: SinkStepTag.Cont;
    readonly state: S;
}

export function sinkDone<A0, S>(s: S, leftover: Option<A0>): SinkStepDone<A0, S> {
    return { _tag: SinkStepTag.Done, state: s, leftover };
}

export function isSinkCont<A0, S>(s: SinkStep<A0, S>): s is SinkStepCont<S> {
    return s._tag === SinkStepTag.Cont;
}

export function isSinkDone<S, A0>(s: SinkStep<S, A0>): s is SinkStepDone<S, A0> {
    return s._tag === SinkStepTag.Done;
}

export interface SinkStepDone<A0, S> {
    readonly _tag: SinkStepTag.Done;
    readonly state: S;
    readonly leftover: Option<A0>;
}

export function sinkStepLeftover<A0 ,S>(s: SinkStep<A0, S>): Option<A0> {
    if (s._tag === SinkStepTag.Cont) {
        return none;
    } else {
        return s.leftover;
    }
}

export function map<A0, S, S1>(step: SinkStep<A0, S>, f: FunctionN<[S], S1>): SinkStep<A0, S1> {
    return {
        ...step,
        state: f(step.state)
    };
}

export function traverse<F>(F: Applicative<F>): <A0, S, S1>(step: SinkStep<A0, S>, f: FunctionN<[S], HKT<F, S1>>) => HKT<F, SinkStep<A0, S1>> {
    return <A0, S, S1>(step: SinkStep<A0, S>, f: FunctionN<[S], HKT<F, S1>>): HKT<F, SinkStep<A0, S1>> =>
        F.map(f(step.state), (s1) => ({...step, state: s1}))
}
