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

import * as s from "../src/stream";
import { Stream } from "../src/stream";
import * as ref from "waveguide/lib/ref";
import { done, raise } from "waveguide/lib/exit";
import * as wave from "waveguide/lib/io";
import * as resource from "waveguide/lib/resource";
import { expectExit } from "./tools.spec";
import { pipe } from "fp-ts/lib/pipeable";
import { Option, none, some } from "fp-ts/lib/Option";
import { RSink, liftPureSink } from "../src/sink";
import * as sink from "../src/sink";
import { DefaultR, RIO } from "waveguide/lib/io";
import { SinkStep, sinkCont, sinkDone, } from "../src/step";

describe("streams", () => {
    describe("empty", () => {
        it("should be empty", () => {
            return expectExit(s.collectArray(s.empty), done([]));
        });
    });
    describe("fromArray", () => {
        it("should constuct a stream from an array", () => {
            const stream = s.fromArray([1, 2, 3]);
            return expectExit(s.collectArray(stream), done([1, 2, 3]));
        });
    });
    describe("fromIterator", () => {
        it("should construct a stream from an iterator", () => {
            const stream = s.fromIterator(function* () {
                yield 1;
                yield 2;
                yield 3;
            });
            return expectExit(s.collectArray(stream), done([1, 2, 3]));
        });
    });
    describe("concat", () => {
        it("should concat two streams", () => {
            const s1 = s.fromArray([1, 2]);
            const s2 = s.fromIterator(function* (): Iterator<number> { yield 3; yield 4; });
            const c: Stream<never, number> = s.concat(s1, s2);
            return expectExit(s.collectArray(c), done([1, 2, 3, 4]));
        });
    });
    describe("chain", () => {
        it("should chain", () => {
            const s1 = s.fromArray([1, 2]);
            const s2 = s.chain(s1, (n) => s.fromArray([n, -n]));
            return expectExit(s.collectArray(s2), done([1, -1, 2, -2]));
        });
    });
    describe("fromSource", () => {
        it("should construct a stream from a source", () => {
            const source =
                pipe(
                    resource.encaseRIO(ref.makeRef([1, 2, 3])),
                    resource.mapWith((cell) =>
                        cell.modify((as) => {
                            return as.length === 0 ?
                                [none as Option<number>, as] as const : [some(as[0]), as.slice(1, as.length)] as const;
                        })
                    )
                );
            const s1 = s.fromSource(source)
            return expectExit(s.collectArray(s1), done([1, 2, 3]));
        });
    });
    describe("map", () => {
        it("should map a stream", () => {
            const s1 = s.fromArray([1, 2]);
            const s2 = s.map(s1, (i) => i + 1);
            return expectExit(s.collectArray(s2), done([2, 3]));
        });
    })
    describe("transduce", () => {
        // We describe transduction as the process of consuming some elements (1 or more) to produce an output element
        // The transducer used for the test is a summer
        // i.e. it consumes the number of elements to read, then that number of elements, and then outputs the sum

        function transducer(): RSink<DefaultR, never, readonly [number, number], never, number, number> {
            const initial = sinkCont([-1, 0] as const);
            
            function step(state: readonly [number, number], next: number): SinkStep<never, readonly [number, number]> {
                if (state[0] < 0) {
                    return sinkCont([next, 0] as const);
                }
                if (state[0] === 1) {
                    return sinkDone([0, state[1] + next] as const, none);
                }
                return sinkCont([state[0] - 1, state[1] + next] as const);
            }

            function extract(state: readonly [number, number]): number {
                return state[1];
            }

            return liftPureSink({ initial, step, extract })
        }

        it("should perform transduction", () => {
            const s1 = s.fromArray([2, 4, 6, 3, -10, -20, -30, 2]);
            const s2 = s.transduce(s1, transducer());
            return expectExit(s.collectArray(s2), done([10, -60, 0]));
        });

        it("should emit nothing when a transducer makes no progress", () => {
            const s1 = s.fromArray([2, 4, 6]);
            const s2 = s.transduce(s1, sink.constSink(5));
            return expectExit(s.collectArray(s2), done([]));
        });
    });
    describe("peel", () => {
        it("should extract a head and return a subsequent element", () => {
            const multiplier = sink.map(sink.headSink<DefaultR, never, number>(), (opt) => opt._tag === "Some" ? opt.value : 1);
            const s1 = s.fromArray([2, 6, 9])
            const s2 =  
                s.chain(s.peel(s1, multiplier), 
                    ([head, rest]) =>
                        s.map(rest, (v) => v * head))
            return expectExit(s.collectArray(s2), done([12,18]));
        })
    });
});
