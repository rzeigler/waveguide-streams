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

import { some, none, Option } from "fp-ts/lib/Option";
import * as s from "../src/stream";
import * as snk from "../src/sink";
import * as cio from "waveguide/lib/console";
import { Stream } from "../src/stream";
import { IO } from "waveguide/lib/io";
import * as wave from "waveguide/lib/io";
import { Readable } from "stream";
import { Do } from "fp-ts-contrib/lib/Do";
import * as resource from "waveguide/lib/resource";
import * as deferred from "waveguide/lib/deferred";
import { pipe } from "fp-ts/lib/pipeable";
import { open, read } from "./common";
import { Resource } from "waveguide/lib/resource";

/**
 * Streams can also perform actions effectfully.
 * Additionally, all streams are run by evaluating them into sinks
 * The collectArray function you have seen so far is just runing sinks into the collect array sink to produce an aggregation
 * 
 * Here, we will read all lines from package.json, decode them, uppercase them, and then log them to the terminal.
 * 
 * At their core, streams are just a Managed<R, E, Fold> 
 *  (where Fold is a somewhat complicated type you don't have to immediately worry about)
 * 
 * So, to start with reading a file, we need a resource of a file descriptor
 */

const fd: Resource<NodeJS.ErrnoException, number> = open("./package.json", "r");

/**
 * Now, given a file descriptor, we need to turn this into a Fold.
 * One way of doing so, is by using the fromSource function, which converts a Resource<E, IO<E, Option<A>> into a Stream<E, A>
 * The expectation is that the IO will return some until it eventually returns none to signify stream exhaustion
 * Lets do this
 */
const source: Resource<NodeJS.ErrnoException, IO<NodeJS.ErrnoException, Option<readonly [Buffer, number]>>> = 
    resource.map(fd, (h) => {
        // This will read a 120 byte block
        // I picked 120 because this will guarantee that no lines are wider than 120 in the output
        const doRead = read(h, 120);
        // But we still need a way of signalling termination
        // If we read 0 bytes we are done
        return wave.map(doRead, (([buf, len]) => len > 0 ? some([buf, len] as const) : none))
    }) 

/**
 * Now we have something suitable for creating a stream from
 */
const buffers: Stream<NodeJS.ErrnoException, readonly [Buffer, number]> = s.fromSource(source);

/**
 * Now, lets perform some decoding.
 * Please note this will not actually work for non-ascii characters that occur at the chunk boundaries
 */
const strings: Stream<NodeJS.ErrnoException, string> = 
    s.map(buffers, ([buffer, len]) => buffer.toString("utf-8", 0, len));

/**
 * And we can now uppercase
 */
const upper: Stream<NodeJS.ErrnoException, string> = 
    s.map(strings, (s) => s.toUpperCase());

/**
 * And finally we want to log everything that we got.
 * This involves creating a sink and running the stream into it
 */
const sink = snk.evalSink(cio.log);

/**
 * Thus, we compile our final action to run the pipeline
 */
wave.runR(s.into(upper, sink), {});

