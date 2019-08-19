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

import { array } from "fp-ts/lib/Array";
import { Option, some, none } from "fp-ts/lib/Option";
import * as cio from "waveguide/lib/console";
import * as s from "../src";
import { Stream } from "../src";
import { DefaultR, IO } from "waveguide/lib/io";
import * as wave from "waveguide/lib/io";
import { Readable } from "stream";
import { Do } from "fp-ts-contrib/lib/Do";
import * as resource from "waveguide/lib/resource";
import { Resource } from "waveguide/lib/resource";
import * as ref from "waveguide/lib/ref";
import * as deferred from "waveguide/lib/deferred";
import { Deferred } from "waveguide/lib/deferred";
import { Ref } from "waveguide/lib/ref";
import { Fiber } from "waveguide/lib/fiber";
import { pipe } from "fp-ts/lib/pipeable";
import { read } from "fs";

// A nice helper for logging
function log<E, A>(tag: string, io: IO<E, A>): IO<E, void> {
    return wave.chain(io, (a) => cio.log(tag, a));
}


/**
 * A Stream<R, E, A> is an effectful process that may:
 *  - produce zero or more A values
 *  - may fail early with an error E
 *  - may or may not complete
 *  - depends on an environment R
 * 
 * Streams may be created in a number of ways
 */

// Constant streams may be created from single values
const a: Stream<never, number> = s.once(1);

// From arrays
const as: Stream<never, number>  = s.fromArray([42, 43, 44]);

// From iterators
const bs: Stream<never, number>  = s.fromIterator(function* (): Iterator<number> {
    yield -42;
    yield -43;
    yield -44
})

/**
 * Creating a stream doesn't do anything. 
 * Its merely a description of the stream.
 * First we must compile the stream using a collection strategy
 */
const a_: IO<never, number[]> = s.collectArray(a);

const as_: IO<never, number[]> = s.collectArray(as);

/**
 * We can also compile a stream to run for just its effects
 * 
 */
const bs_: IO<never, void> = s.drain(bs);

wave.runR(array.sequence(wave.instances)([
    log("once", a_),
    log("from array", as_),
    log("from iterator drained", bs_)
]), {});
