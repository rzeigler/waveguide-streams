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
import { done, raise, Exit } from "waveguide/lib/exit";
import * as managed from "waveguide/lib/managed";
import { expectExit } from "./tools.spec";
import { pipe } from "fp-ts/lib/pipeable";
import { Option, none, some } from "fp-ts/lib/Option";
import { Sink, liftPureSink } from "../src/sink";
import * as sink from "../src/sink";
import { SinkStep, sinkDone, sinkCont } from "../src/step";
import { identity } from "fp-ts/lib/function";
import * as wave from "waveguide/lib/wave";
import { Wave } from "waveguide/lib/wave";
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
    describe("drain", () => {
        it("should error on stream error", () => {
            const as: Array<Wave<string, number>> = [wave.pure(1), wave.raiseError("boom")];
            const s1 = s.fromArray(as) as Stream<string, Wave<string, number>>;
            const s2 = s.mapM(s1, identity);
            return expectExit(s.drain(s2), raise("boom"));
        });
    })
    describe("concat", () => {
        it("should concat two streams", () => {
            const s1 = s.fromArray([1, 2]);
            const s2 = s.fromIterator(function* (): Iterator<number> { yield 3; yield 4; });
            const c: Stream<never, number> = s.concat(s1, s2);
            return expectExit(s.collectArray(c), done([1, 2, 3, 4]));
        });
        const s1 = s.fromArray([1, 2]) as Stream<string, number>;
        const s2 = s.raised("boom") as Stream<string, number>;
        it("should raise errors in second stream", () => {
            const c = s.concat(s1, s2);
            return expectExit(s.collectArray(c), raise("boom"));
        });
        it("should raise errors first stream", () => {
            const c = s.concat(s2, s1);
            return expectExit(s.collectArray(c), raise("boom"));
        });
    });
    describe("chain", () => {
        it("should chain", () => {
            const s1 = s.fromArray([1, 2]);
            const s2 = s.chain(s1, (n) => s.fromArray([n, -n]));
            return expectExit(s.collectArray(s2), done([1, -1, 2, -2]));
        });
        it("should propogate errors in a stream", () => {
            const s1 = s.fromArray([
                s.once(1),
                s.raised("boom"),
                s.once(3)
            ]) as Stream<string, Stream<string, number>>;
            return expectExit(s.collectArray(s.flatten(s1)), raise("boom"));
        })
    });
    describe("fromSource", () => {
        it("should construct a stream from a source", () => {
            const source =
                pipe(
                    managed.encaseWave(ref.makeRef([1, 2, 3])),
                    managed.mapWith((cell) =>
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
        it("should map empty streams", () => {
            const s1 = s.empty;
            const s2 = s.map(s1, (i) => i + 1);
            return expectExit(s.collectArray(s2), done([]));
        });
    });
    describe("fold", () => {
        it("should fold a stream down", () => {
            const s1 = s.fromArray([1, 2]);
            const s2 = s.fold(s1, (a, b) => a + b, 0);
            return expectExit(s.collectArray(s2), done([3]));
        });
        it("should handle empty streams", () => {
            const s1 = s.empty as Stream<never, number>
            const s2 = s.fold(s1, (a, b) => a + b, 0);
            return expectExit(s.collectArray(s2), done([0]));
        });
    });
    describe("filter", () => {
        it("should filter", () => {
            const s1 = s.fromArray([1, 2, 3, 4]);
            const s2 = s.filter(s1, (f) => f % 2 === 0);
            return expectExit(s.collectArray(s2), done([2, 4]));
        })
    })
    describe("scan", () => {
        it("should scan a stream", () => {
            const s1 = s.fromArray([1, 2]);
            const s2 = s.scan(s1, (a, b) => a + b, 0);
            return expectExit(s.collectArray(s2), done([0, 1, 3]));
        });
    })
    describe("transduce", () => {
        // We describe transduction as the process of consuming some elements (1 or more) to produce an output element
        // The transducer used for the test is a summer
        // i.e. it consumes the number of elements to read, then that number of elements, and then outputs the sum
        function transducer(): Sink<never, readonly [number, number], number, number> {
            const initial = sinkCont([-1, 0] as const);

            function step(state: readonly [number, number], next: number): SinkStep<never, readonly [number, number]> {
                if (state[0] < 0) {
                    return sinkCont([next, 0] as const);
                }
                if (state[0] === 1) {
                    return sinkDone([0 as number, state[1] + next] as const, [] as never[]);
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

        it("should transduce empty streams", () => {
            const s1 = s.empty as Stream<never, number>;
            const s2 = s.transduce(s1, transducer());
            return expectExit(s.collectArray(s2), done([]));
        });

        function slidingBuffer(): Sink<never, number[], number, number[]> {
            const initial = sinkCont([] as number[]);

            function step(state: number[], next: number): SinkStep<number, number[]> {
                const more = [...state, next];
                if (more.length === 3) {
                    return sinkDone(more, more.slice(1));
                } else {
                    return sinkCont(more);
                }
            }

            function extract(state: number[]): number[] {
                return state;
            }

            return liftPureSink({ initial, step, extract });
        }

        it("should handle remainders set correctly", () => {
            const s1 = s.fromRange(0, 1, 4);
            const s2 = s.transduce(s1, slidingBuffer());
            return expectExit(s.collectArray(s2), done([
                [0, 1, 2],
                [1, 2, 3],
                [2, 3, 4],
                [3, 4] // final emission happens here but there is no way of filling the buffer beyond
            ]));
        })
    });
    describe("peel", () => {
        const multiplier = sink.map(sink.headSink<never, number>(), (opt) => opt._tag === "Some" ? opt.value : 1);
        it("should handle empty arrays", () => {
            const s1 = s.empty as Stream<never, number>;
            const s2 = s.peel(s1, multiplier);
            return expectExit(s.collectArray(s.chain(s2, ([h, r]) => r)), done([]));
        });
        it("should extract a head and return a subsequent element", () => {
            const s1 = s.fromArray([2, 6, 9])
            const s2 =
                s.chain(s.peel(s1, multiplier),
                    ([head, rest]) => {
                        return s.map(rest, (v) => v * head)
                    })
            return expectExit(s.collectArray(s2), done([12, 18]));
        });
        it("should compose", () => {
            const s1 = s.fromRange(3, 1, 8) // emits 3, 4, 5, 6, 7, 8
            const s2 = s.filter(s1, (x) => x % 2 === 0); // emits 4 6 8
            const s3 =
                s.chain(s.peel(s2, multiplier),
                    ([head, rest]) => { // head is 4
                        return s.map(rest, (v) => v * head)  // emits 24 32
                    });
            return expectExit(s.collectArray(s3), done([24, 32]));
        });
        it("should raise errors", () => {
            const s1 = s.fromArray([s.raised("boom"), s.once(1)]) as Stream<string, Stream<string, number>>;
            const s2 = s.flatten(s1);
            const s3 = s.peel(s2, multiplier);
            return expectExit(s.collectArray(s3), raise("boom"));
        });
        it("should raise errors in the remainder stream", () => {
            const s1 = s.fromArray([s.once(2), s.raised("boom"), s.once(1)]) as Stream<string, Stream<string, number>>;
            const s2 = s.flatten(s1);
            const s3 = s.chain(s.peel(s2, multiplier), ([_head, rest]) => rest);
            return expectExit(s.collectArray(s3), raise("boom"));
        })
    });
    describe("drop", () => {
        it("should drop n elements", () => {
            const s1 = s.fromArray([1, 2, 3, 4, 5]);
            const s2 = s.drop(s1, 3);
            return expectExit(s.collectArray(s2), done([4, 5]));
        });
        it("should drop n elements when that is more than in the stream", () => {
            const s1 = s.fromArray([1, 2, 3]);
            const s2 = s.drop(s1, 4);
            return expectExit(s.collectArray(s2), done([]));
        });
        it("should compose", () => {
            const s1 = s.fromRange(0, 1, 10) // [0, 10]
            const s2 = s.filter(s1, (x) => x % 2 === 0); // [0, 2, 4, 6, 8, 10]
            const s3 = s.drop(s2, 3);
            return expectExit(s.collectArray(s3), done([6, 8, 10]));
        })
    });
    describe("dropWhile", () => {
        it("should drop elements", () => {
            const s1 = s.fromArray([-2, -1, 0, 1, 2, 1, 0, -1, -2]);
            const s2 = s.dropWhile(s1, (i) => i <= 0);
            return expectExit(s.collectArray(s2), done([1, 2, 1, 0, -1, -2]));
        });
        it("should handle never finding an element", () => {
            const s1 = s.fromArray([-2, -3, -1, -8]);
            const s2 = s.dropWhile(s1, (i) => i <= 0);
            return expectExit(s.collectArray(s2), done([]));
        });
        it("should handle empty arrays", () => {
            const s1 = s.fromArray([] as number[]);
            const s2 = s.dropWhile(s1, (i) => i <= 0);
            return expectExit(s.collectArray(s2), done([]));
        });
    });
    describe("take", () => {
        it("should take elements", () => {
            const s1 = s.fromArray([1, 2, 3, 4]);
            const s2 = s.take(s1, 2);
            return expectExit(s.collectArray(s2), done([1, 2]));
        });
        it("should take more elements", () => {
            const s1 = s.fromArray([1, 2, 3, 4]);
            const s2 = s.take(s1, 9);
            return expectExit(s.collectArray(s2), done([1, 2, 3, 4]));
        });
        it("should make infinite streams finite", () => {
            const s1 = s.repeatedly(1);
            const s2 = s.take(s1, 3);
            return expectExit(s.collectArray(s2), done([1, 1, 1]));
        })
    });
    describe("takeWhile", () => {
        it("should take elements", () => {
            const s1 = s.fromArray([-2, -1, 0, 1, 2, -1]);
            const s2 = s.takeWhile(s1, (i) => i <= 0);
            return expectExit(s.collectArray(s2), done([-2, -1, 0]));
        })
    })
    describe("zip", () => {
        it("should zip maxing at the shorter length", () => {
            const s1 = s.fromRange(0);
            const s2 = s.fromRange(0, 1, 4);
            const s3 = s.zip(s1, s2);
            return expectExit(s.collectArray(s3), done([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]));
        });
        it("should handle errors", () => {
            const s1 = s.fromRange(0) as Stream<string, number>;
            const s2 = s.flatten(s.fromArray([s.once(1), s.raised("boom")]) as Stream<string, Stream<string, number>>);
            const s3 = s.zip(s1, s2);
            return expectExit(s.collectArray(s3), raise("boom"));
        })
    })
});
