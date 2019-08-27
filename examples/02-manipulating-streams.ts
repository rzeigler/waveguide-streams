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

import { log } from "./common";
import * as s from "../src/stream";
import { Wave } from "waveguide/lib/wave";
import * as wave from "waveguide/lib/wave";
import { array } from "fp-ts/lib/Array";

/**
 * Streams have many combinators that can be used to manipulate them
 * 
 */
const as = s.fromArray([1, 2, 3, 4, 5]);


/**
 * We can map over them
 */
const nas = s.map(as, (a) => -a);

/**
 * We can chain over them
 */
const bas = s.chain(as, (a) => s.fromArray([a, -a]))

/**
 * We can zip with index
 * @param n 
 * 
 */
const basi = s.zipWithIndex(as);

/**
 * We can effectfully map over them
 */
function randomM(n: number): Wave<never, number> {
  return wave.map(
    wave.sync(() => Math.random()),
    (i) => i * n
  );
}

const ras = s.mapM(as, randomM);

wave.run(array.sequence(wave.instances)([
  log(s.collectArray(as)),
  log(s.collectArray(nas)),
  log(s.collectArray(bas)),
  log(s.collectArray(bas)),
  log(s.collectArray(basi)),
  log(s.collectArray(ras))]
))
