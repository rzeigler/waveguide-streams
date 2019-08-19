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
import { FunctionN, Predicate, Lazy, constTrue } from "fp-ts/lib/function";
import { pipe } from "fp-ts/lib/pipeable";
import { flow } from "fp-ts/lib/function";
import * as wave from "waveguide/lib/io";
import { IO, RIO, DefaultR } from "waveguide/lib/io";
import * as resource from "waveguide/lib/resource";
import { Managed } from "waveguide/lib/resource";
import * as ref from "waveguide/lib/ref";
import { array } from "fp-ts/lib/Array";

export type Source<R, E, A> = RIO<R, E, Option<A>>

export type Fold<R, E, A> = <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R, E, S>>) => RIO<R, E, S>

export type RStream<R, E, A> = Managed<R, E, Fold<R, E, A>>;

export type Stream<E, A> = RStream<DefaultR, E, A>;

// export enum SinkTag {

// }

// export interface Sink<R, E, A0, A, B> {

// }

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

export function fromSource<R, E, A>(r: Managed<R, E, RIO<R, E, Option<A>>>): RStream<R, E, A> {
    return resource.map(r, sourceFold);
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

export function concat<R, E, A>(stream1: RStream<R, E, A>, stream2: RStream<R, E, A>): RStream<R, E, A> {
    function fold<S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R, E, S>>): RIO<R, E, S> {
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

export function collectArray<R, E, A>(stream: RStream<R, E, A>): RIO<R, E, A[]> {
    return resource.use(stream, (fold) => 
        fold([] as A[], constTrue, (s, a) => wave.pure([...s, a]))
    )
}

export function drain<R, E, A>(stream: RStream<R, E, A>): RIO<R, E, void> {
    return resource.use(stream, (fold) => 
        fold(undefined as void, constTrue, (s, _) => wave.pure(s))
    );
}
