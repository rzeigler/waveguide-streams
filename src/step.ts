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

import { HKT } from "fp-ts/lib/HKT";
import { Applicative } from "fp-ts/lib/Applicative";
import { FunctionN } from "fp-ts/lib/function";

export enum SinkStepTag { Cont, Done }

export type SinkStep<A, S> = SinkStepCont<S> | SinkStepDone<A, S>;

export function sinkCont<S>(s: S): SinkStepCont<S> {
  return { _tag: SinkStepTag.Cont, state: s };
}

export interface SinkStepCont<S> {
    readonly _tag: SinkStepTag.Cont;
    readonly state: S;
}

export function sinkDone<A, S>(s: S, leftover: readonly A[]): SinkStepDone<A, S> {
  return { _tag: SinkStepTag.Done, state: s, leftover };
}

export function isSinkCont<A0, S>(s: SinkStep<A0, S>): s is SinkStepCont<S> {
  return s._tag === SinkStepTag.Cont;
}

export function isSinkDone<S, A0>(s: SinkStep<S, A0>): s is SinkStepDone<S, A0> {
  return s._tag === SinkStepTag.Done;
}

export interface SinkStepDone<A, S> {
    readonly _tag: SinkStepTag.Done;
    readonly state: S;
    readonly leftover: readonly A[];
}

export function sinkStepLeftover<A ,S>(s: SinkStep<A, S>): readonly A[] {
  if (s._tag === SinkStepTag.Cont) {
    return [];
  } else {
    return s.leftover;
  }
}

export function sinkStepState<A0, S>(s: SinkStep<A0, S>): S {
  return s.state;
}

export function map<A0, S, S1>(step: SinkStep<A0, S>, f: FunctionN<[S], S1>): SinkStep<A0, S1> {
  return {
    ...step,
    state: f(step.state)
  };
}

export function mapWith<S, S1>(f: FunctionN<[S], S1>): <A>(step: SinkStep<A, S>) => SinkStep<A, S1> {
  return <A>(step: SinkStep<A, S>) => map(step, f);
}

export function traverse<F>(F: Applicative<F>): <A0, S, S1>(step: SinkStep<A0, S>, f: FunctionN<[S], HKT<F, S1>>) => HKT<F, SinkStep<A0, S1>> {
  return <A0, S, S1>(step: SinkStep<A0, S>, f: FunctionN<[S], HKT<F, S1>>): HKT<F, SinkStep<A0, S1>> =>
    F.map(f(step.state), (s1) => ({...step, state: s1}))
}
