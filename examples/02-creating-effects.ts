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
import { left, right } from "fp-ts/lib/Either";
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
import * as fs from "fs";

/**
 * We can also create from 
 */

function close(fd: number): IO<NodeJS.ErrnoException, void> {
    return wave.uninterruptible(wave.async((callback) => {
        fs.close(fd, (err) => {
            if (err) { 
                callback(left(err))
            } else {
                callback(right(undefined));
            }
        })
        return () => {};
    }));
}

function handle(path: string, flags: string): Resource<NodeJS.ErrnoException, number> {
    const open: IO<NodeJS.ErrnoException, number> = wave.uninterruptible(wave.async((callback) => {
        fs.open(path, flags, (err, fd) => {
            if (err) {
                callback(left(err))
            } else {
                callback(right(fd));
            }
        })
        return () => {};
    }));

    return resource.bracket(
        open,
        close
    );
}

function readFrom(fd: number): IO<NodeJS.ErrnoException, Option<string>> {
    return wave.uninterruptible(wave.async((callback) => {
        const buffer = Buffer.alloc(1024);
        fs.read(fd, buffer, 0, 1024, null, (err, read, buffer) => {
            if (err) {
                callback(left(err));
            } else if (read <= 0) {
                callback(right(none));
            } else {
                callback(right(some(buffer.toString("utf-8", 0, read))));
            }
        })
        return () => {};
    }));
}

function fileStream(path: string): Stream<NodeJS.ErrnoException, string> {
    return pipe(
        handle(path, "r"),
        resource.mapWith(readFrom),
        s.fromSource
    );
}

const packageJson = fileStream("./package.json");

/**
 * We can also map things...
 */
const upperCased = s.map(packageJson, (s) => s.toUpperCase());

const compiled = s.collectArray(upperCased);

wave.runR(wave.chain(compiled, cio.log), {});


