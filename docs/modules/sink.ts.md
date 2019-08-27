---
title: sink.ts
nav_order: 1
parent: Modules
---

---

<h2 class="text-delta">Table of contents</h2>

- [Sink (interface)](#sink-interface)
- [SinkPure (interface)](#sinkpure-interface)
- [collectArraySink (function)](#collectarraysink-function)
- [constSink (function)](#constsink-function)
- [drainSink (function)](#drainsink-function)
- [drainWhileSink (function)](#drainwhilesink-function)
- [evalSink (function)](#evalsink-function)
- [headSink (function)](#headsink-function)
- [lastSink (function)](#lastsink-function)
- [liftPureSink (function)](#liftpuresink-function)
- [map (function)](#map-function)
- [queueSink (function)](#queuesink-function)
- [stepMany (function)](#stepmany-function)

---

# Sink (interface)

**Signature**

```ts
export interface Sink<E, S, A, B> {
  readonly initial: Wave<E, SinkStep<A, S>>
  step(state: S, next: A): Wave<E, SinkStep<A, S>>
  extract(step: S): Wave<E, B>
}
```

# SinkPure (interface)

**Signature**

```ts
export interface SinkPure<S, A, B> {
  readonly initial: SinkStep<A, S>
  step(state: S, next: A): SinkStep<A, S>
  extract(state: S): B
}
```

# collectArraySink (function)

**Signature**

```ts
export function collectArraySink<E, A>(): Sink<E, A[], A, A[]> { ... }
```

# constSink (function)

**Signature**

```ts
export function constSink<E, A, B>(b: B): Sink<E, void, A, B> { ... }
```

# drainSink (function)

**Signature**

```ts
export function drainSink<E, A>(): Sink<E, void, A, void> { ... }
```

# drainWhileSink (function)

**Signature**

```ts
export function drainWhileSink<E, A>(f: Predicate<A>): Sink<E, Option<A>, A, Option<A>> { ... }
```

# evalSink (function)

**Signature**

```ts
export function evalSink<E, A>(f: FunctionN<[A], Wave<E, unknown>>): Sink<E, void, A, void> { ... }
```

# headSink (function)

**Signature**

```ts
export function headSink<E, A>(): Sink<E, Option<A>, A, Option<A>> { ... }
```

# lastSink (function)

**Signature**

```ts
export function lastSink<E, A>(): Sink<E, Option<A>, A, Option<A>> { ... }
```

# liftPureSink (function)

**Signature**

```ts
export function liftPureSink<S, A, B>(sink: SinkPure<S, A, B>): Sink<never, S, A, B> { ... }
```

# map (function)

**Signature**

```ts
export function map<E, S, A, B, C>(sink: Sink<E, S, A, B>, f: FunctionN<[B], C>): Sink<E, S, A, C> { ... }
```

# queueSink (function)

**Signature**

```ts
export function queueSink<E, A>(queue: ConcurrentQueue<A>): Sink<E, void, A, void> { ... }
```

# stepMany (function)

Step a sink repeatedly.
If the sink completes before consuming all of the input, then the done state will include the ops leftovers
and anything left in the array

**Signature**

```ts
export function stepMany<E, S, A, B>(sink: Sink<E, S, A, B>, s: S, multi: readonly A[]): Wave<E, SinkStep<A, S>> { ... }
```
