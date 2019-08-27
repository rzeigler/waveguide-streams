---
title: stream.ts
nav_order: 3
parent: Modules
---

---

<h2 class="text-delta">Table of contents</h2>

- [Fold (type alias)](#fold-type-alias)
- [Source (type alias)](#source-type-alias)
- [Stream (type alias)](#stream-type-alias)
- [URI (type alias)](#uri-type-alias)
- [URI (constant)](#uri-constant)
- [empty (constant)](#empty-constant)
- [instances (constant)](#instances-constant)
- [never (constant)](#never-constant)
- [aborted (function)](#aborted-function)
- [as (function)](#as-function)
- [chain (function)](#chain-function)
- [collectArray (function)](#collectarray-function)
- [concat (function)](#concat-function)
- [concatL (function)](#concatl-function)
- [drain (function)](#drain-function)
- [drop (function)](#drop-function)
- [dropWhile (function)](#dropwhile-function)
- [dropWith (function)](#dropwith-function)
- [encaseWave (function)](#encasewave-function)
- [filter (function)](#filter-function)
- [filterWith (function)](#filterwith-function)
- [flatten (function)](#flatten-function)
- [fold (function)](#fold-function)
- [foldM (function)](#foldm-function)
- [fromArray (function)](#fromarray-function)
- [fromIterator (function)](#fromiterator-function)
- [fromIteratorUnsafe (function)](#fromiteratorunsafe-function)
- [fromOption (function)](#fromoption-function)
- [fromRange (function)](#fromrange-function)
- [fromSource (function)](#fromsource-function)
- [into (function)](#into-function)
- [intoLeftover (function)](#intoleftover-function)
- [intoManaged (function)](#intomanaged-function)
- [map (function)](#map-function)
- [mapM (function)](#mapm-function)
- [mapWith (function)](#mapwith-function)
- [merge (function)](#merge-function)
- [once (function)](#once-function)
- [peel (function)](#peel-function)
- [peelManaged (function)](#peelmanaged-function)
- [periodically (function)](#periodically-function)
- [raised (function)](#raised-function)
- [repeat (function)](#repeat-function)
- [repeatedly (function)](#repeatedly-function)
- [scan (function)](#scan-function)
- [scanM (function)](#scanm-function)
- [switchLatest (function)](#switchlatest-function)
- [switchMapLatest (function)](#switchmaplatest-function)
- [take (function)](#take-function)
- [takeWhile (function)](#takewhile-function)
- [transduce (function)](#transduce-function)
- [zip (function)](#zip-function)
- [zipWith (function)](#zipwith-function)
- [zipWithIndex (function)](#zipwithindex-function)

---

# Fold (type alias)

**Signature**

```ts
export type Fold<E, A> = <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], Wave<E, S>>) => Wave<E, S>
```

# Source (type alias)

**Signature**

```ts
export type Source<E, A> = Wave<E, Option<A>>
```

# Stream (type alias)

**Signature**

```ts
export type Stream<E, A> = Managed<E, Fold<E, A>>
```

# URI (type alias)

**Signature**

```ts
export type URI = typeof URI
```

# URI (constant)

**Signature**

```ts
export const URI = ...
```

# empty (constant)

A stream that emits no elements an immediately terminates

**Signature**

```ts
export const  = ...
```

# instances (constant)

**Signature**

```ts
export const instances: Monad2<URI> = ...
```

# never (constant)

A stream that emits no elements but never terminates.

**Signature**

```ts
export const never: Stream<never, never> = ...
```

# aborted (function)

Create a stream that immediately aborts

**Signature**

```ts
export function aborted(e: unknown): Stream<never, never> { ... }
```

# as (function)

Map every element emitted by stream to b

**Signature**

```ts
export function as<E, A, B>(stream: Stream<E, A>, b: B): Stream<E, B> { ... }
```

# chain (function)

Monadic chain on a stream

**Signature**

```ts
export function chain<E, A, B>(stream: Stream<E, A>, f: FunctionN<[A], Stream<E, B>>): Stream<E, B> { ... }
```

# collectArray (function)

Collect all the elements emitted by a stream into an array.

**Signature**

```ts
export function collectArray<E, A>(stream: Stream<E, A>): Wave<E, A[]> { ... }
```

# concat (function)

Strict form of concatL

**Signature**

```ts
export function concat<E, A>(stream1: Stream<E, A>, stream2: Stream<E, A>): Stream<E, A> { ... }
```

# concatL (function)

Create a stream that emits all the elements of stream1 followed by all the elements of stream2

**Signature**

```ts
export function concatL<E, A>(stream1: Stream<E, A>, stream2: Lazy<Stream<E, A>>): Stream<E, A> { ... }
```

# drain (function)

Evaluate a stream for its effects

**Signature**

```ts
export function drain<E, A>(stream: Stream<E, A>): Wave<E, void> { ... }
```

# drop (function)

Drop some number of elements from a stream

Their effects to be produced still occur in the background

**Signature**

```ts
export function drop<E, A>(stream: Stream<E, A>, n: number): Stream<E, A> { ... }
```

# dropWhile (function)

Drop elements of the stream while a predicate holds

**Signature**

```ts
export function dropWhile<E, A>(stream: Stream<E, A>, pred: Predicate<A>): Stream<E, A> { ... }
```

# dropWith (function)

Curried form of drop

**Signature**

```ts
export function dropWith(n: number): <E, A>(stream: Stream<E, A>) => Stream<E, A> { ... }
```

# encaseWave (function)

Create a stream that evalutes w to emit a single element

**Signature**

```ts
export function encaseWave<E, A>(w: Wave<E, A>): Stream<E, A> { ... }
```

# filter (function)

Filter the elements of a stream by a predicate

**Signature**

```ts
export function filter<E, A>(stream: Stream<E, A>, f: Predicate<A>): Stream<E, A> { ... }
```

# filterWith (function)

Curried form of map

**Signature**

```ts
export function filterWith<A>(f: Predicate<A>): <E>(stream: Stream<E, A>) => Stream<E, A> { ... }
```

# flatten (function)

Flatten a stream of streams

**Signature**

```ts
export function flatten<E, A>(stream: Stream<E, Stream<E, A>>): Stream<E, A> { ... }
```

# fold (function)

Fold the elements of a stream together purely

**Signature**

```ts
export function fold<E, A, B>(stream: Stream<E, A>, f: FunctionN<[B, A], B>, seed: B): Stream<E, B> { ... }
```

# foldM (function)

Fold the elements of this stream together using an effect.

The resulting stream will emit 1 element produced by the effectful fold

**Signature**

```ts
export function foldM<E, A, B>(stream: Stream<E, A>, f: FunctionN<[B, A], Wave<E, B>>, seed: B): Stream<E, B> { ... }
```

# fromArray (function)

Create a stream from an Array

**Signature**

```ts
export function fromArray<A>(as: readonly A[]): Stream<never, A> { ... }
```

# fromIterator (function)

Create a stream from an iterator

**Signature**

```ts
export function fromIterator<A>(iter: Lazy<Iterator<A>>): Stream<never, A> { ... }
```

# fromIteratorUnsafe (function)

Create a stream from an existing iterator

**Signature**

```ts
export function fromIteratorUnsafe<A>(iter: Iterator<A>): Stream<never, A> { ... }
```

# fromOption (function)

Create a stream that immediately emits either 0 or 1 elements

**Signature**

```ts
export function fromOption<A>(opt: Option<A>): Stream<never, A> { ... }
```

# fromRange (function)

Create a stream that emits the elements in a range

**Signature**

```ts
export function fromRange(start: number, interval?: number, end?: number): Stream<never, number> { ... }
```

# fromSource (function)

Create a Stream from a source A action.

The contract is that the acquisition of the resource should produce a Wave that may be repeatedly evaluated
during the scope of the Managed
If there is more data in the stream, the Wave should produce some(A) otherwise it should produce none.
Once it produces none, it will not be evaluated again.

**Signature**

```ts
export function fromSource<E, A>(r: Managed<E, Wave<E, Option<A>>>): Stream<E, A> { ... }
```

# into (function)

Push a stream into a sink to produce the sink's result

**Signature**

```ts
export function into<E, A, S, B>(stream: Stream<E, A>, sink: Sink<E, S, A, B>): Wave<E, B> { ... }
```

# intoLeftover (function)

Push a stream in a sink to produce the result and the leftover

**Signature**

```ts
export function intoLeftover<E, A, S, B>(stream: Stream<E, A>, sink: Sink<E, S, A, B>): Wave<E, readonly [B, readonly A[]]> { ... }
```

# intoManaged (function)

Push a stream into a sink to produce the sink's result

**Signature**

```ts
export function intoManaged<E, A, S, B>(stream: Stream<E, A>, managedSink: Managed<E, Sink<E, S, A, B>>): Wave<E, B> { ... }
```

# map (function)

Map the elements of a stream

**Signature**

```ts
export function map<E, A, B>(stream: Stream<E, A>, f: FunctionN<[A], B>): Stream<E, B> { ... }
```

# mapM (function)

Map each element of the stream effectfully

**Signature**

```ts
export function mapM<E, A, B>(stream: Stream<E, A>, f: FunctionN<[A], Wave<E, B>>): Stream<E, B> { ... }
```

# mapWith (function)

Curried form of map

**Signature**

```ts
export function mapWith<A, B>(f: FunctionN<[A], B>): <E>(stream: Stream<E, A>) => Stream<E, B> { ... }
```

# merge (function)

Merge a stream of streams into a single stream.

This stream will run up to maxActive streams concurrently to produce values into the output stream.

**Signature**

```ts
export function merge<E, A>(stream: Stream<E, Stream<E, A>>, maxActive: number, maxBuffer: number = 12): Stream<E, A> { ... }
```

# once (function)

Create a stream that emits a single element

**Signature**

```ts
export function once<A>(a: A): Stream<never, A> { ... }
```

# peel (function)

Feed a stream into a sink to produce a value.

Emits the value and a 'remainder' stream that includes the rest of the elements of the input stream.

**Signature**

```ts
export function peel<E, A, S, B>(stream: Stream<E, A>, sink: Sink<E, S, A, B>): Stream<E, readonly [B, Stream<E, A>]> { ... }
```

# peelManaged (function)

**Signature**

```ts
export function peelManaged<E, A, S, B>(stream: Stream<E, A>, managedSink: Managed<E, Sink<E, S, A, B>>): Stream<E, readonly [B, Stream<E, A>]> { ... }
```

# periodically (function)

**Signature**

```ts
export function periodically(ms: number): Stream<never, number> { ... }
```

# raised (function)

Create a stream that immediately fails

**Signature**

```ts
export function raised<E>(e: E): Stream<E, never> { ... }
```

# repeat (function)

Creates a stream that repeatedly emits the elements of a stream forever.

The elements are not cached, any effects required (i.e. opening files or sockets) are repeated for each cycle

**Signature**

```ts
export function repeat<E, A>(stream: Stream<E, A>): Stream<E, A> { ... }
```

# repeatedly (function)

Create a stream that emits As as fast as possible

Be cautious when using this. If your entire pipeline is full of synchronous actions you can block the main
thread until the stream runs to completion (or forever) using this

**Signature**

```ts
export function repeatedly<A>(a: A): Stream<never, A> { ... }
```

# scan (function)

Purely scan a stream

**Signature**

```ts
export function scan<E, A, B>(stream: Stream<E, A>, f: FunctionN<[B, A], B>, seed: B): Stream<E, B> { ... }
```

# scanM (function)

Scan across the elements the stream.

This is like foldM but emits every intermediate seed value in the resulting stream.

**Signature**

```ts
export function scanM<E, A, B>(stream: Stream<E, A>, f: FunctionN<[B, A], Wave<E, B>>, seed: B): Stream<E, B> { ... }
```

# switchLatest (function)

Create a stream that switches to emitting elements of the most recent input stream.

**Signature**

```ts
export function switchLatest<E, A>(stream: Stream<E, Stream<E, A>>): Stream<E, A> { ... }
```

# switchMapLatest (function)

Create a straem that switches to emitting the elements of the most recent stream produced by applying f to the
element most recently emitted

**Signature**

```ts
export function switchMapLatest<E, A, B>(stream: Stream<E, A>, f: FunctionN<[A], Stream<E, B>>): Stream<E, B> { ... }
```

# take (function)

Take some number of elements of a stream

**Signature**

```ts
export function take<E, A>(stream: Stream<E, A>, n: number): Stream<E, A> { ... }
```

# takeWhile (function)

Take elements of a stream while a predicate holds

**Signature**

```ts
export function takeWhile<E, A>(stream: Stream<E, A>, pred: Predicate<A>): Stream<E, A> { ... }
```

# transduce (function)

Transduce a stream via a sink.

This repeatedly run a sink to completion on the elements of the input stream and emits the result of each run
Leftovers from a previous run are fed to the next run

**Signature**

```ts
export function transduce<E, A, S, B>(stream: Stream<E, A>, sink: Sink<E, S, A, B>): Stream<E, B> { ... }
```

# zip (function)

zipWith to form tuples

**Signature**

```ts
export function zip<E, A, B>(as: Stream<E, A>, bs: Stream<E, B>): Stream<E, readonly [A, B]> { ... }
```

# zipWith (function)

Zip two streams together termitating when either stream is exhausted

**Signature**

```ts
export function zipWith<E, A, B, C>(as: Stream<E, A>, bs: Stream<E, B>, f: FunctionN<[A, B], C>): Stream<E, C> { ... }
```

# zipWithIndex (function)

Zip all stream elements with their index ordinals

**Signature**

```ts
export function zipWithIndex<E, A>(stream: Stream<E, A>): Stream<E, readonly [A, number]> { ... }
```
