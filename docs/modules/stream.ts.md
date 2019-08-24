---
title: stream.ts
nav_order: 3
parent: Modules
---

---

<h2 class="text-delta">Table of contents</h2>

- [StepAbort (interface)](#stepabort-interface)
- [StepEnd (interface)](#stepend-interface)
- [StepError (interface)](#steperror-interface)
- [StepValue (interface)](#stepvalue-interface)
- [Fold (type alias)](#fold-type-alias)
- [RStream (type alias)](#rstream-type-alias)
- [Source (type alias)](#source-type-alias)
- [Step (type alias)](#step-type-alias)
- [Stream (type alias)](#stream-type-alias)
- [empty (constant)](#empty-constant)
- [never (constant)](#never-constant)
- [stepEnd (constant)](#stepend-constant)
- [chain (function)](#chain-function)
- [collectArray (function)](#collectarray-function)
- [concat (function)](#concat-function)
- [concatL (function)](#concatl-function)
- [drain (function)](#drain-function)
- [drop (function)](#drop-function)
- [dropWith (function)](#dropwith-function)
- [encase (function)](#encase-function)
- [filter (function)](#filter-function)
- [filterWith (function)](#filterwith-function)
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
- [once (function)](#once-function)
- [peel (function)](#peel-function)
- [peelManaged (function)](#peelmanaged-function)
- [repeat (function)](#repeat-function)
- [repeatedly (function)](#repeatedly-function)
- [scan (function)](#scan-function)
- [scanM (function)](#scanm-function)
- [stepAbort (function)](#stepabort-function)
- [stepError (function)](#steperror-function)
- [stepValue (function)](#stepvalue-function)
- [take (function)](#take-function)
- [takeWhile (function)](#takewhile-function)
- [transduce (function)](#transduce-function)
- [zipWithIndex (function)](#zipwithindex-function)

---

# StepAbort (interface)

**Signature**

```ts
export interface StepAbort<E, A> {
  _tag: StepTag.Abort
  e: unknown
}
```

# StepEnd (interface)

**Signature**

```ts
export interface StepEnd<E, A> {
  _tag: StepTag.End
}
```

# StepError (interface)

**Signature**

```ts
export interface StepError<E, A> {
  _tag: StepTag.Error
  e: E
}
```

# StepValue (interface)

**Signature**

```ts
export interface StepValue<E, A> {
  _tag: StepTag.Value
  a: A
}
```

# Fold (type alias)

**Signature**

```ts
export type Fold<R, E, A> = <S>(initial: S, cont: Predicate<S>, step: FunctionN<[S, A], RIO<R, E, S>>) => RIO<R, E, S>
```

# RStream (type alias)

**Signature**

```ts
export type RStream<R, E, A> = Managed<R, E, Fold<R, E, A>>
```

# Source (type alias)

**Signature**

```ts
export type Source<R, E, A> = RIO<R, E, Option<A>>
```

# Step (type alias)

**Signature**

```ts
export type Step<E, A> = StepValue<E, A> | StepError<E, A> | StepEnd<E, A> | StepAbort<E, A>
```

# Stream (type alias)

**Signature**

```ts
export type Stream<E, A> = RStream<DefaultR, E, A>
```

# empty (constant)

**Signature**

```ts
export const  = ...
```

# never (constant)

**Signature**

```ts
export const never: Stream<never, never> = ...
```

# stepEnd (constant)

**Signature**

```ts
export const stepEnd: Step<never, never> = ...
```

# chain (function)

**Signature**

```ts
export function chain<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[A], RStream<R, E, B>>): RStream<R, E, B> { ... }
```

# collectArray (function)

**Signature**

```ts
export function collectArray<R, E, A>(stream: RStream<R, E, A>): RIO<R, E, A[]> { ... }
```

# concat (function)

**Signature**

```ts
export function concat<R, E, A>(stream1: RStream<R, E, A>, stream2: RStream<R, E, A>): RStream<R, E, A> { ... }
```

# concatL (function)

**Signature**

```ts
export function concatL<R, E, A>(stream1: RStream<R, E, A>, stream2: Lazy<RStream<R, E, A>>): RStream<R, E, A> { ... }
```

# drain (function)

**Signature**

```ts
export function drain<R, E, A>(stream: RStream<R, E, A>): RIO<R, E, void> { ... }
```

# drop (function)

**Signature**

```ts
export function drop<R, E, A>(stream: RStream<R, E, A>, n: number): RStream<R, E, A> { ... }
```

# dropWith (function)

**Signature**

```ts
export function dropWith(n: number): <R, E, A>(stream: RStream<R, E, A>) => RStream<R, E, A> { ... }
```

# encase (function)

**Signature**

```ts
export function encase<R, E, A>(rio: RIO<R, E, A>): RStream<R, E, A> { ... }
```

# filter (function)

**Signature**

```ts
export function filter<R, E, A>(stream: RStream<R, E, A>, f: Predicate<A>): RStream<R, E, A> { ... }
```

# filterWith (function)

**Signature**

```ts
export function filterWith<A>(f: Predicate<A>): <R, E>(stream: RStream<R, E, A>) => RStream<R, E, A> { ... }
```

# fold (function)

**Signature**

```ts
export function fold<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[B, A], B>, seed: B): RStream<R, E, B> { ... }
```

# foldM (function)

**Signature**

```ts
export function foldM<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[B, A], RIO<R, E, B>>, seed: B): RStream<R, E, B> { ... }
```

# fromArray (function)

**Signature**

```ts
export function fromArray<A>(as: readonly A[]): Stream<never, A> { ... }
```

# fromIterator (function)

**Signature**

```ts
export function fromIterator<A>(iter: Lazy<Iterator<A>>): Stream<never, A> { ... }
```

# fromIteratorUnsafe (function)

**Signature**

```ts
export function fromIteratorUnsafe<A>(iter: Iterator<A>): Stream<never, A> { ... }
```

# fromOption (function)

**Signature**

```ts
export function fromOption<A>(opt: Option<A>): Stream<never, A> { ... }
```

# fromRange (function)

**Signature**

```ts
export function fromRange(start: number, interval?: number, end?: number): Stream<never, number> { ... }
```

# fromSource (function)

**Signature**

```ts
export function fromSource<R, E, A>(r: Managed<R, E, RIO<R, E, Option<A>>>): RStream<R, E, A> { ... }
```

# into (function)

**Signature**

```ts
export function into<R, E, A, S, B>(stream: RStream<R, E, A>, sink: RSink<R, E, S, A, B>): RIO<R, E, B> { ... }
```

# intoLeftover (function)

**Signature**

```ts
export function intoLeftover<R, E, A, S, B>(stream: RStream<R, E, A>, sink: RSink<R, E, S, A, B>): RIO<R, E, readonly [B, readonly A[]]> { ... }
```

# intoManaged (function)

**Signature**

```ts
export function intoManaged<R, E, A, S, B>(stream: RStream<R, E, A>, managedSink: Managed<R, E, RSink<R, E, S, A, B>>): RIO<R, E, B> { ... }
```

# map (function)

**Signature**

```ts
export function map<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[A], B>): RStream<R, E, B> { ... }
```

# mapM (function)

**Signature**

```ts
export function mapM<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[A], RIO<R, E, B>>): RStream<R, E, B> { ... }
```

# mapWith (function)

**Signature**

```ts
export function mapWith<A, B>(f: FunctionN<[A], B>): <R, E>(stream: RStream<R, E, A>) => RStream<R, E, B> { ... }
```

# once (function)

**Signature**

```ts
export function once<A>(a: A): Stream<never, A> { ... }
```

# peel (function)

**Signature**

```ts
export function peel<R, E, A, S, B>(stream: RStream<R, E, A>, sink: RSink<R, E, S, A, B>): RStream<R, E, readonly [B, RStream<R, E, A>]> { ... }
```

# peelManaged (function)

**Signature**

```ts
export function peelManaged<R, E, A, S, B>(stream: RStream<R, E, A>, managedSink: Managed<R, E, RSink<R, E, S, A, B>>): RStream<R, E, readonly [B, RStream<R, E, A>]> { ... }
```

# repeat (function)

**Signature**

```ts
export function repeat<R1, E, A>(stream: RStream<R1, E, A>): RStream<R1, E, A> { ... }
```

# repeatedly (function)

**Signature**

```ts
export function repeatedly<A>(a: A): Stream<never, A> { ... }
```

# scan (function)

**Signature**

```ts
export function scan<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[B, A], B>, seed: B): RStream<R, E, B> { ... }
```

# scanM (function)

**Signature**

```ts
export function scanM<R, E, A, B>(stream: RStream<R, E, A>, f: FunctionN<[B, A], RIO<R, E, B>>, seed: B): RStream<R, E, B> { ... }
```

# stepAbort (function)

**Signature**

```ts
export function stepAbort(e: unknown): Step<never, never> { ... }
```

# stepError (function)

**Signature**

```ts
export function stepError<E>(e: E): Step<E, never> { ... }
```

# stepValue (function)

**Signature**

```ts
export function stepValue<A>(a: A): Step<never, A> { ... }
```

# take (function)

**Signature**

```ts
export function take<R, E, A>(stream: RStream<R, E, A>, n: number): RStream<R, E, A> { ... }
```

# takeWhile (function)

**Signature**

```ts
export function takeWhile<R, E, A>(stream: RStream<R, E, A>, pred: Predicate<A>): RStream<R, E, A> { ... }
```

# transduce (function)

Transduce a stream via a sink.

**Signature**

```ts
export function transduce<R, E, A, S, B>(stream: RStream<R, E, A>, sink: RSink<R, E, S, A, B>): RStream<R, E, B> { ... }
```

# zipWithIndex (function)

**Signature**

```ts
export function zipWithIndex<R, E, A>(stream: RStream<R, E, A>): RStream<R, E, readonly [A, number]> { ... }
```
