# Traversal

Detailed information about `Traversal` and traversals can be found in their
[further reading chapter](/further-reading/traversal). In essence, `Traversal`
provides a purely functional mechanism by which to traverse an informal tree
composed of `List` and `Map` data structures.

In general, the traversal methods take a configuration object that must contain
a `map` function, and may optionally contain a `reduce` and a `recurse` function.

The `map` function is called for each data value in the structure, and is expected
to return one of the following `types.traversal` case class instances:

* `value(x)` uses value `x` as the mapping result.
* `recurse(obj)` will continue traversal into a `List` or `Map` `obj` structure.
* `delegate(f)` will call `f` as the mapping function instead, and use its result,
  for only this data value.
* `defer({ recurse?, map?, reduce? })` will merge the given configuration and use it
  for this and all data values nested recursively within this point in the tree.
* `varying(v)` returns a `Varying` `v`, where `v` contains one of these case class
  instances.
* `nothing` indicates that this data value should not be mapped onto the output
  structure.

If provided, the `reduce` function turns traversal into a map-reducing operation
and thus a folded result rather than a mapped tree structure. It is called with
the final mapped structure, and may return anything.

If provided, the `recurse` function is called before traversal performs each recursion,
including recursion into the root structure of the tree. This gives an opportunity
to process structural aspects of the structure before it is actually mapped. The
`diff` traverser, for instance, compares the number of members of each structure
and does not bother comparing deeply the actual members of the structures if they
do not match. `recurse` may return any of the `type.traversal` case classes described
above for `map`.

In general, it is possible to traverse structures into static or eagerly updated
results (ie returning `Array` vs `List`), and preserving the existing structure
type or crushing everything down to `List`. This 2&times;2 possibility matrix
yields four traversal methods, detailed below.

The `Traversal` object also contains default implementations of `serialize` and
`diff`, used by the framework itself. These are provided partially so the framework
may use them internally, and partially so that custom implementations of these
behaviors may easily `defer` or `delegate` to them when in cases where there is
no deviation from standard behavior.

## Performing Traversal

For all of the below, the following function signatures apply:

* `recurse: (obj: List|Map) -> types.traversal` where `obj` is the original structure
  pre-traversal. This function will be the first thing called when Traversal begins.
* `map: (key: Int|String, value: \*, obj: List|Map, attribute: Attribute?) -> types.traversal`
  where `key` and `value` relate to the original data, `attribute` gives an instance
  of the `Attribute` at that `key` if the structure is a `Model` and has an attribute
  defined for it.
* `reduce: (obj: Array|List) -> \*` where `obj` is the mapped structure post-traversal.

### λnatural
#### Traversal.natural({ recurse?, map }, obj: Enumerable): Map|List

* !CURRIES

Performs traversal, preserving structure (`Map`s stay `Map`s, and `List`s stay
`List`s) and returning an eagerly updated structure which will continue to maintain
its transformation of the source structures until `.destroy()`ed.

> Please see above for definitions of `recurse` and `map`.

~~~
const data = new Map({ x: 1, y: new List([ 2, 3 ]), z: new Map({ x: 4, y: 5 }) });
const result = Traversal.natural({
  map: (_, v) => v.isEnumerable
    ? types.traversal.recurse(v)
    : types.traversal.value(v * 2)
}, data);
data.set('w', 0);
return inspect.panel(result);
~~~

### λnatural_
#### Traversal.natural_({ recurse?, map }, obj: Enumerable): Object|Array

* !CURRIES

Like `#natural`, but performs the traversal only once, returning a static structure
of plain Javascript `Object`s and `Array`s.

> Please see above for definitions of `recurse` and `map`.

~~~
const data = new Map({ x: 1, y: new List([ 2, 3 ]), z: new Map({ x: 4, y: 5 }) });
return Traversal.natural_({
  map: (_, v) => v.isEnumerable
    ? types.traversal.recurse(v)
    : types.traversal.value(v * 2)
}, data);
~~~

### λlist
#### Traversal.list({ recurse?, map, reduce? }, obj: Enumerable): List

* !CURRIES

Performs traversal, crushing `Map`s to `List`s (with no particular guaranteed indexing
order), and returning an eagerly updated structure which will continue to maintain
its transformation of the source structures until `.destroy()`ed.

> Please see above for definitions of `recurse`, `map`, and `reduce`.

~~~
const data = new Map({ x: 1, y: new List([ 2, 3 ]), z: new Map({ x: 4, y: 5 }) });
const result = Traversal.list({
  map: (_, v) => v.isEnumerable
    ? types.traversal.recurse(v)
    : types.traversal.value(v * 2)
}, data);
data.set('w', 0);
return inspect.panel(result);
~~~

### λlist_
#### Traversal.list_({ recurse?, map, reduce? }, obj: Enumerable): Array

* !CURRIES

Like `#list`, but performs the traversal only once, returning a static structure
of plain Javascript `Array's. Note that despite the name `list_` (chose for consistency
with `#list`), this method returns an `Array`.

> Please see above for definitions of `recurse`, `map`, and `reduce`.

~~~
const data = new Map({ x: 1, y: new List([ 2, 3 ]), z: new Map({ x: 4, y: 5 }) });
return Traversal.list_({
  map: (_, v) => v.isEnumerable
    ? types.traversal.recurse(v)
    : types.traversal.value(v * 2),
  reduce: (xs) => xs.reduce((x, y) => x + y, 0)
}, data);
~~~

## Default Implementations

### ::serialize
#### Traversal.default.serialize: { map }

The default serializing Traversal operates on the following rules, in order:

* If an `attribute` exists on the parent `Model` for a given data value, then
  `#serialize` is called on that attribute instance and the result is used.
* If the data value has a `#serialize` method, it is called and the result is used.
* If the data value is `Enumerable` (ie it is a `Map` or a `List`) then it is
  recursed into.
* Otherwise, the data value is passed through as-is.

~~~
const data = new Map({ x: 1, y: new List([ 2, 3 ]), z: new Map({ x: 4, y: 5 }) });
return Traversal.natural_(data, Traversal.default.serialize);
~~~

### ::diff
#### Traversal.default.diff: { recurse, map, reduce }

The default diffing Traversal relies on their `context` providing the diffing
target under the key `other`.

It `recurse`s as follows:

* If the object types do not match (eg `Map` vs `List`), `false` is returned.
* If the number of members do not match, `false` is returned.
* Otherwise, recurses into both structures.

It `map`s as follows:

* If both values are enumerable and of the same type, recursion is invoked.
* Otherwise, the values are directly compared by `===` equality, and a boolean
  is returned.

It `reduce`s by simply calling `.any()` on the resulting `List[Boolean]`.

In this sample, we demonstrate the use of a custom Traversal that delegates to
the default implementation in most cases, but makes sure never to compare any
data value under a `meta` key:

~~~
const data1 = new Map({
  name: 'Alice',
  friend: new Map({ name: 'Bob', meta: new Map({ clicked: 7 }) }),
  meta: new Map({ clicked: 17 })
});
const data2 = new Map({
  name: 'Alice',
  friend: new Map({ name: 'Bob', meta: new Map({ clicked: 2 }) }),
  meta: new Map({ clicked: 1 })
});
return Traversal.list({
  recurse: Traversal.default.diff.recurse,
  map: k => (k === 'meta')
    ? types.traversal.value(false)
    : types.traversal.delegate(Traversal.default.diff.map),
  reduce: Traversal.default.diff.reduce
}, [ data1, data2 ]);
~~~

