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

import { Wave } from "waveguide/lib/wave";
import * as wave from "waveguide/lib/wave";
import * as cio from "waveguide/lib/console";
import * as managed from "waveguide/lib/managed";
import { Managed } from "waveguide/lib/managed";
import * as fs from "fs";
import { left, right } from "fp-ts/lib/Either";

// A nice helper for logging
export function log<E, A>(io: Wave<E, A>): Wave<E, void> {
  return wave.chain(io, cio.log);
}

export const openFile = (path: string, flags: string): Wave<NodeJS.ErrnoException, number> => wave.uninterruptible(
  wave.async((callback) => {
    fs.open(path, flags, 
      (err, fd) => {
        if (err) {
          callback(left(err))
        } else {
          callback(right(fd))
        }
      }
    )
    return () => {};
  }));


/**
 * Here we close a file handle
 */
export const closeFile = (handle: number): Wave<NodeJS.ErrnoException, void> => wave.uninterruptible(
  wave.async((callback) => {
    fs.close(handle, (err) => {
      if (err) {
        callback(left(err))
      } else {
        callback(right(undefined))
      }
    })
    return () => {};
  }));

export const open = (path: string, flags: string): Managed<NodeJS.ErrnoException, number> => 
  managed.bracket(openFile(path, flags), closeFile);

/**
 * We can also use a file handle to write content
 */
export const write = (handle: number, data: string): Wave<NodeJS.ErrnoException, number> => wave.uninterruptible(
  wave.async((callback) => {
    fs.write(handle, data, (err, written) => {
      if (err) {
        callback(left(err))
      } else {
        callback(right(written));
      }
    })
    return () => {};
  })
)

export const read = (handle: number, length: number): Wave<NodeJS.ErrnoException, [Buffer, number]> => wave.uninterruptible(
  // Here we see suspended, which is how we can 'effectfully' create an Wave to run
  // In this case we allocate a mutable buffer inside suspended
  wave.suspended(() => {
    const buffer = Buffer.alloc(length);
    return wave.async((callback) => {
      fs.read(handle, buffer, 0, length, null, (err, ct, buffer) => {
        if (err)
          callback(left(err));
        else
          callback(right([buffer, ct]));
      })
      return () => {};
    });
  })
)
