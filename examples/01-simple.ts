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
import * as cio from "waveguide/lib/console";
import * as s from "../src";
import { Stream } from "../src";
import { DefaultR, IO } from "waveguide/lib/io";
import * as wave from "waveguide/lib/io";

// A nice helper for logging
function log<E, A>(tag: string, io: IO<E, A>): IO<E, void> {
    return wave.chain(io, (a) => cio.log(tag, a));
}


/**
 * The simplest stream emits a single element
 */
const os: Stream<DefaultR, never, number> = s.once(42);

/**
 * So far we have only a description of a stream, before we can do anything with it, we must compile it down
 */
const o_: IO<never, number[]> = s.collectArray(os);

/**
 * Simple streams can be created from many things
 */
const a = [1, 2, 3, 4, 42];

/**
 * Now that we have a stream, we need to actually run it to produce values
 */
const as: Stream<DefaultR, never, number> = s.fromArray(a);

/**
 * Now we have compiled a stream down to an action
 */
const a_: IO<never, number[]> = s.collectArray(as);

/**
 * It is also possible to create from iterators
 */
function* b(): Iterator<number> {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 42;
}

const bs: Stream<DefaultR, never, number> = s.fromIterator(() => b());

const b_: IO<never, number[]> = s.collectArray(bs);


/**
 * Streams may also be concatenated
 */

 
const abs = s.concat(as, bs)

const ab_ = s.collectArray(abs)

/**
 * Streams can also be chained
 */
const acs = s.chain(as, (a) => s.fromArray([a, -a]))

const ac_ = s.collectArray(acs)

/**
 * Streams may also be evaluated for only their effects.
 * See..
 */
const adrain: IO<never, void> = s.drain(acs);

/**
 * And we can run it
 */
wave.runR(
    array.sequence(wave.instances)([
        log("o", o_),
        log("as", a_),
        log("bs", b_),
        log("abs", ab_),
        log("asc", ac_),
        log("adrain", adrain)
    ]), {});
