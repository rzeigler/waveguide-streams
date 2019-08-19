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

import { some, none } from "fp-ts/lib/Option";
import * as s from "../src";
import { Stream } from "../src";
import { IO } from "waveguide/lib/io";
import * as wave from "waveguide/lib/io";
import { Readable } from "stream";
import { Do } from "fp-ts-contrib/lib/Do";
import * as resource from "waveguide/lib/resource";
import * as deferred from "waveguide/lib/deferred";
import { pipe } from "fp-ts/lib/pipeable";

/**
 * We can also create 
 * @param readable 
 */
function onReadableError(readable: Readable): IO<never, Error> {
    return wave.asyncTotal((callback) => {
        function listen(e: Error): void {
            callback(e)
        }
        readable.once("e", listen);
        return () => {
            readable.off("e", listen);
        }
    })
}

function onReadableEnd(readable: Readable): IO<never, void> {
    return wave.asyncTotal((callback) => {
        function listen(): void {
            callback(undefined);
        }
        readable.once("end", listen);
        return () => {
            readable.off("end", listen);
        }
    });
}

function onReadableReadable(readable: Readable): IO<never, void> {
    return wave.asyncTotal((callback) => {
        function listen(): void {
            callback(undefined)
        }
        readable.once("readable", listen);
        return () => {
            readable.off("readable", listen);
        };
    });
}

function readReadable(readable: Readable): IO<never, unknown[]> {
    return wave.sync(() => {
        const chunks = [] as unknown[];
        let chunk: unknown | null = readable.read(1024);
        while (chunk) {
            chunks.push(chunk);
            chunk = readable.read(1024);
        }
        return chunks;
    });
}

// From effects
// This is the unfortunate nature of adapting readable streams...
function fromReadable(readable: Readable): Stream<Error, unknown[]> {
    const streamError = 
        Do(resource.instances)
            .bind("error", resource.encaseRIO(deferred.makeDeferred<Error, never>()))
            .doL(({error}) => 
                pipe(
                    onReadableError(readable),
                    wave.chainWith(error.error),
                    resource.fiber // fork this proxy process
                )
            )
            .return(({error}) => error);
    
    const streamEnd = 
        Do(resource.instances)
            .bind("end", resource.encaseRIO(deferred.makeDeferred<never, void>()))
            .doL(({end}) => 
                pipe(
                    onReadableEnd(readable),
                    wave.chainWith(end.done),
                    resource.fiber
                )
            )
            .return(({end}) => end);

    const source = 
        pipe(
            resource.zip(streamError, streamEnd),
            resource.mapWith(([error, end]) => {
                const read = 
                        wave.applySecond(onReadableReadable(readable), readReadable(readable));

                const againstDone = 
                    wave.race(
                        wave.map(read, some),
                        wave.as(end.wait, none)
                    );
                    
                const againstError = 
                    wave.race(
                        againstDone,
                        error.wait
                    );

                return againstError;
            })
        );


    return s.fromSource(source);
}
