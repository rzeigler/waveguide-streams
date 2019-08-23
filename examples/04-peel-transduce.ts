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

import { some, none, option } from "fp-ts/lib/Option";
import { monoidString } from "fp-ts/lib/Monoid";
import { intercalate } from "fp-ts/lib/Foldable";
import * as opt from "fp-ts/lib/Option";
import { Stream } from "../src/stream";
import * as stream from "../src/stream";
import * as snk from "../src/sink";
import * as stp from "../src/step";
import * as common from "./common";
import { Resource } from "waveguide/lib/resource";
import * as resource from "waveguide/lib/resource";
import * as wave from "waveguide/lib/io";
import * as cio from "waveguide/lib/console";
import { pipe } from "fp-ts/lib/pipeable";
import { zipWith as arrayZipWith, array} from "fp-ts/lib/Array";


/**
 * Streams also provide several more advanced means of manipulating features
 * Lets write a function that is able to construct a stream of text that is line delimited json objects from a csv file
 * Before we start, we need a few things.
 * 
 * First, lets write a 'lines' transducer that extract a single line from a stream of text.
 * This can be a pure transducer because it does not need any effects.
 * Transducers need an initial state, a step function, and an extract function
 */

 /**
  * Here we define a transducer that will extract a single line
  */

export interface SplitState {
    buffer: string;
    emit: string[];
}

function splitSink<R, E>(split: string): snk.Sink<E, SplitState, string, string[]> {
    const initial = stp.sinkCont({buffer: "", emit: []});

    function extract(s: SplitState): string[] {
        if (s.emit.length > 0) {
            return s.emit;
        } else {
            return [s.buffer];
        }
    }

    function step(s: SplitState, a: string): stp.SinkStep<string, SplitState> {
        const next = s.buffer + a;
        if (next.indexOf(split) > 0) {
            const splitted = next.split(split);
            const emit = splitted.slice(0, splitted.length - 1)
            const rem = splitted.length > 1 ?  [splitted[splitted.length - 1]] : [];
            return stp.sinkDone(
                {buffer: "", emit: emit}, 
                rem
            );
        } else {
            return stp.sinkCont({buffer: next, emit: []});
        }
    }
    return snk.liftPureSink({initial, extract, step});
}

function csvFileToParsedJson(path: string) {
    const fd = common.open(path, "r");
    const source = resource.map(fd, (h) => {
        const doRead = common.read(h, 120);
        return wave.map(doRead, (([buf, len]) => len > 0 ? some([buf, len] as const) : none))
    });

    const buffers = stream.fromSource(source);

    const text = stream.map(buffers, ([buffer, len]) => {
        const s = buffer.toString("utf8", 0, len)
        return s;
    });

    const lines: Stream<NodeJS.ErrnoException, string> = 
        stream.chain(stream.transduce(text, splitSink("\n")), (a) => stream.fromArray(a) as Stream<NodeJS.ErrnoException, string>);

    const headerAndBody = stream.peel(lines, snk.map(snk.headSink(), o => pipe(o, opt.getOrElse(() => ""))));
    
    const jsonRecords = 
        stream.chain(headerAndBody, ([header, rest]) => {
            const parser = makeLineParser(header);
            return stream.map(rest, parser);
        })

    return jsonRecords;
}

const cells = csvFileToParsedJson("examples/csv/Demographic_Statistics_By_Zip_Code.csv");


const io = stream.into(cells, snk.evalSink(cio.log));

wave.runR(io, {}, (o) => console.log(o));


function makeLineParser(header: string): (row: string) => string {
    const cols = header.split(",");
    return (s) => {
        const split = s.split(",");
        return  intercalate(monoidString, array)(",", arrayZipWith(cols, split, (k, v) => `${k}=${v}`));
    }
}
