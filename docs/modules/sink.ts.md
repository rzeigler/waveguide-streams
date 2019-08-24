---
title: sink.ts
nav_order: 1
parent: Modules
---

---

<h2 class="text-delta">Table of contents</h2>

- [RSink (interface)](#rsink-interface)
- [SinkPure (interface)](#sinkpure-interface)
- [Sink (type alias)](#sink-type-alias)
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

# RSink (interface)

**Signature**

```ts
export interface RSink<R, E, S, A, B> {
  readonly initial: RIO<R, E, SinkStep<A, S>>
  step(state: S, next: A): RIO<R, E, SinkStep<A, S>>
  extract(step: S): RIO<R, E, B>
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

# Sink (type alias)

**Signature**

```ts
export type Sink<E, S, A, B> = RSink<DefaultR, E, S, A, B>
```

# collectArraySink (function)

**Signature**

```ts
export function collectArraySink<R, E, A>(): RSink<R, E, A[], A, A[]> { ... }
```

# constSink (function)

**Signature**

```ts
export function constSink<R, E, A, B>(b: B): RSink<R, E, void, A, B> { ... }
```

# drainSink (function)

**Signature**

```ts
export function drainSink<R, E, A>(): RSink<R, E, void, A, void> { ... }
```

# drainWhileSink (function)

**Signature**

```ts
export function drainWhileSink<R, E, A>(f: Predicate<A>): RSink<R, E, Option<A>, A, Option<A>> { ... }
```

# evalSink (function)

**Signature**

```ts
export function evalSink<R, E, A>(f: FunctionN<[A], RIO<R, E, unknown>>): RSink<R, E, void, A, void> { ... }
```

# headSink (function)

**Signature**

```ts
export function headSink<R, E, A>(): RSink<R, E, Option<A>, A, Option<A>> { ... }
```

# lastSink (function)

**Signature**

```ts
export function lastSink<R, E, A>(): RSink<R, E, Option<A>, A, Option<A>> { ... }
```

# liftPureSink (function)

**Signature**

```ts
export function liftPureSink<S, A, B>(sink: SinkPure<S, A, B>): Sink<never, S, A, B> { ... }
```

# map (function)

**Signature**

```ts
export function map<R, E, S, A, B, C>(sink: RSink<R, E, S, A, B>, f: FunctionN<[B], C>): RSink<R, E, S, A, C> { ... }
```

# queueSink (function)

**Signature**

```ts
export function queueSink<R, E, A>(queue: ConcurrentQueue<A>): RSink<R, E, void, A, void> { ... }
```

# stepMany (function)

Step a sink repeatedly.
If the sink completes before consuming all of the input, then the done state will include the ops leftovers
and anything left in the array

**Signature**

```ts
export function stepMany<R, E, S, A, B>(sink: RSink<R, E, S, A, B>, s: S, multi: readonly A[]): RIO<R, E, SinkStep<A, S>> { ... }
```
