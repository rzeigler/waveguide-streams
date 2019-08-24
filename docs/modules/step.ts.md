---
title: step.ts
nav_order: 2
parent: Modules
---

---

<h2 class="text-delta">Table of contents</h2>

- [SinkStepCont (interface)](#sinkstepcont-interface)
- [SinkStepDone (interface)](#sinkstepdone-interface)
- [SinkStep (type alias)](#sinkstep-type-alias)
- [isSinkCont (function)](#issinkcont-function)
- [isSinkDone (function)](#issinkdone-function)
- [map (function)](#map-function)
- [sinkCont (function)](#sinkcont-function)
- [sinkDone (function)](#sinkdone-function)
- [sinkStepLeftover (function)](#sinkstepleftover-function)
- [sinkStepState (function)](#sinkstepstate-function)
- [traverse (function)](#traverse-function)

---

# SinkStepCont (interface)

**Signature**

```ts
export interface SinkStepCont<S> {
  readonly _tag: SinkStepTag.Cont
  readonly state: S
}
```

# SinkStepDone (interface)

**Signature**

```ts
export interface SinkStepDone<A, S> {
  readonly _tag: SinkStepTag.Done
  readonly state: S
  readonly leftover: readonly A[]
}
```

# SinkStep (type alias)

**Signature**

```ts
export type SinkStep<A, S> = SinkStepCont<S> | SinkStepDone<A, S>
```

# isSinkCont (function)

**Signature**

```ts
export function isSinkCont<A0, S>(s: SinkStep<A0, S>): s is SinkStepCont<S> { ... }
```

# isSinkDone (function)

**Signature**

```ts
export function isSinkDone<S, A0>(s: SinkStep<S, A0>): s is SinkStepDone<S, A0> { ... }
```

# map (function)

**Signature**

```ts
export function map<A0, S, S1>(step: SinkStep<A0, S>, f: FunctionN<[S], S1>): SinkStep<A0, S1> { ... }
```

# sinkCont (function)

**Signature**

```ts
export function sinkCont<S>(s: S): SinkStepCont<S> { ... }
```

# sinkDone (function)

**Signature**

```ts
export function sinkDone<A, S>(s: S, leftover: readonly A[]): SinkStepDone<A, S> { ... }
```

# sinkStepLeftover (function)

**Signature**

```ts
export function sinkStepLeftover<A ,S>(s: SinkStep<A, S>): readonly A[] { ... }
```

# sinkStepState (function)

**Signature**

```ts
export function sinkStepState<A0, S>(s: SinkStep<A0, S>): S { ... }
```

# traverse (function)

**Signature**

```ts
export function traverse<F>(F: Applicative<F>): <A0, S, S1>(step: SinkStep<A0, S>, f: FunctionN<[S], HKT<F, S1>>) => HKT<F, SinkStep<A0, S1>> { ... }
```
