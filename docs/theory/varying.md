The Varying Monad
=================

At the very heart of Janus is `Varying`. Varying is a container type which can
house any value. It provides three important tools for dealing with the housed
value:

1. It can return the value, or call a callback function when the value changes.
2. It can be given a mapping function, and return a new Varying whose value is
   always the mapped result of the value from the original Varying.
3. It can take a nested `Varying[Varying[x]]` situation and flatten it, so that
   you get back just a `Varying[x]`.

Some of you will recognize these three operations as fundamental laws of a certain
nature. Don't worry if you don't&mdash;all that matters is that together, these
three operations are quite powerful.

Varying has a couple of other tricks up its sleeve, which we will discuss later
in this article: the ability to deal with multiple Varyings at once, and a set
of tools to help deal with resource management and garbage collection.

For now, we will start with all the things you can do with a single Varying. We're
going to cover the usage details, then move on to the underlying mechanics; for
more examples of usage, see the [practical guide](/hands-on/varying) article on
this subject.

Creating a Varying
==================

There are two ways to create a new Varying.

~~~
const a = new Varying(4);
const b = new Varying(new Varying(8));

const c = Varying.of(15);
const d = Varying.of(new Varying(16));

return [ a, b, c, d ]; //.map(inspect);
~~~

When you invoke the constructor with `new`, you will always get a Varying containing
the given value. `Varying.of`, on the other hand, will simply hand you back the
input value if it is already a Varying, or else it will do the same thing as the
constructor, wrapping the value in a Varying and handing it back.

> Those of you who dislike `new Varying(x)` syntax can use `Varying.pure(x)` instead.

In reality, it will be rare that you manually construct a Varying. For the most
part, you'll be instead making use of Varyings that more advanced tools in Janus
give you, like `List.watchLength()` or `Model.isValid()`.

Getting a Value
===============

One major way in which Janus differs from conventional Functional Reactive Programming
is that Varyings _always contain a value_. In most FRP approaches like Rx and
ReactiveSwift, the main Varying-like abstraction is more of a way to subscribe to
and manipulate a stream of values than it is a value-containing entity. In those
approaches, you can have one of these boxes in your hand but have no idea what
its value might be until you subscribe to it _and_ a new value comes along.

In Janus, if you have a Varying you have a value. This is similar to, for example,
Mutable Properties in ReactiveSwift.

There are two ways to get the value back out of a Varying. The first is simple:

~~~
return (new Varying(42)).get();
~~~

At any time, you can synchronously request the value and get it back. But while
there is a time and place to do this sort of thing, you shouldn't rely on `get`
too often. Instead, problem solving in Janus is usually best done by accounting
for all possible values over time:

~~~
const result = [];
const v = new Varying(1);
v.react((value) => { result.push(value) });

v.set(2);
v.set(4);
v.set(8);

return result;
~~~

So `react` is the Varying equivalent of Datum `onChange` from the pretend framework
in [the previous article](/theory/rederiving-janus). In most cases, we prefer to
use `react` over `get`, because then we know that any time this value changes,
we are dealing with it appropriately. Again going back to that previous article,
if we are trying to apply some piece of data to the user interface in some way,
using `react` instead of `get` ensures that the interface is _always_ up to date.

One other thing you'll notice here is that the number `1` managed to sneak into
the result! This is because (again like our previous Datum example) calling `react`
will always immediately call your callback with the _current_ value. This again
fits with the philosophy of dealing with all points in time, _including the present
moment_.

If you are sure you don't need to immediately perform some action (for instance
if the initial value is known or unimportant), you can pass `false` as the first
parameter. This paramater is known throughout the framework as `immediate`; a
false `immediate` requests no callback for the immediate value.

~~~
const result = [];
const v = new Varying(1);
v.react(false, (value) => { result.push(value) });

v.set(2);
v.set(4);
v.set(4);

return result;
~~~

This time, the initial `1` value never shows up.

Notice this time that we set `4` twice and nothing happened! Again, this is because
we don't think of Varyings as being streams of values over time, but rather a
container type for some arbitrary single value. It would be weird to tell you
that the value changed, and then hand you the same value again!

So any time a Varying value is changed, it first performs a strict equality (`===`)
comparison on its extant value, and it will do absolutely nothing if they match.

Halting a Reaction
------------------

You can also stop a reaction in one of two ways. The first is the most widely used:

~~~
const results = [];
const v = new Varying(1);
const observation = v.react((value) => { results.push(value); });
v.set(2);
v.set(3);
observation.stop();
v.set(4);
return results;
~~~

When you call `react`, you get back an `Observation` ticket whose primary job is
to give you some way to halt that reaction. There is a somewhat more direct way
to do this:

~~~
const result = [];
const v = new Varying(1);
v.react(function(value) {
  result.push(value);
  this.stop();
});

v.set(2);
return result;
~~~

Inside `react` callbacks, `this` is bound to the observation ticket itself, so
you can just call `this.stop()`. But this won't work with ECMA arrow functions,
because they don't rebind `this`. You'll have to use full `function` syntax.

> In Coffeescript or Livescript, however, `->` arrows _do_ bind `this`. So
> `varying.react(-> this.stop())` will indeed stop the reaction.

Mapping a Varying
=================

It's great that we can apply a result directly to some destination, but often
we need to do some work in advance. We can just cram all of this work inside our
callback to `react`, but what if we want to reuse some of that work? Or worse,
what if we aren't the ones actually calling `react` (as you saw with our mutators
in the previous article)?

Then we'll have to `map` the value. Again, we already covered this when we rederived
Janus, but there are some differences and additions that are worth discussing.

~~~
const a = new Varying(4);
const b = a.map((x) => x * 4);

const results = [];
b.react((x) => { results.push(x) });
a.set(6);
return results;
~~~

This much shouldn't be too surprising. But this might be:

~~~
const results = [];
const a = new Varying(4);
const b = a.map((x) => results.push(x));

a.set(5);
a.set(6);
a.set(7);
return results;
~~~

Hey, what gives? Nothing happened! If my value is changing, why isn't my mapping
function getting called? How does `b` know what value it ought to have? In fact,
we know how to get a value. Let's see what happens if we use that:

~~~
const results = [];
const a = new Varying(4);
const b = a.map((x) => x * 4);

results.push(b.get());
a.set(6);
results.push(b.get());
return results;
~~~

So it still works. What's going on here is that Varying is as lazy as possible,
and in certain places this laziness depends on purity. Let's dig into that for
just a moment.

Some of you may have been concerned after seeing how we put Datum together about
how haphazardly we were generating new pieces of computation and gluing them
together, without any hope of halting those computations. In reality, Janus is
quite careful about such things. It wants to perform as little work as possible
while still fulfilling its obligations.

So, until `get` or `react` are called, which are the only ways to actually extract
a value _out_ of a Varying, it assumes that you simply don't care what that mapped
value might be, and so it doesn't bother running the function. In this sense,
mappings on top of Varyings are really just descriptions of computation, rather
than active demands to perform some task. The demand only comes when that value
is needed.

As a result, `map` _must_ be pure. A pure function is, among other things, one
that relies only on its inputs, and does nothing other than return its output.
(You can, for the most part, consider values from pure closure contexts to be part
of the input to the function). You can try to rely on `map` to perform _impure_
actions elsewhere&mdash;that is to cause other side effects in your program&mdash;but
it is dangerous to do so because you don't know for sure that your mapping function
will ever actually be run.

On the other hand, the nice thing about this approach is that it is (relatively)
free to _describe_ a computation: you can create `map`s left and right full of
complex expensive processing, knowing that they won't run until they must.

Flattening a Varying
====================

What does it mean to flatten a Varying? Consider the following practical situation,
where we end up with a bit of an awkward result.

~~~
const quota = new Varying(10);
const items = new List([ 1, 1, 3, 8 ]);

const exceededQuota = quota.map((q) =>
  items.watchLength().map((count) => count > q));

return exceededQuota.get(); // inspect(exceededQuota.get());
~~~

List has a neat method called `watchLength` which gives you a Varying containing
the live length of that list at all times. What we are trying to do is to see if
perhaps it is too big.

Of course, part of the awkwardness here is that we don't yet know how to take two
Varyings side-by-side and perform some simple work on them at once, so we have to
nest the two together like this. But either way, this result doesn't really work;
anybody trying to listen in to this result has to do a lot of homework to get rid
of that Varying that has snuck its way into our output.

This is where flattening comes in. When a Varying `x` that contains a Varying `y`
is flattened, that new flattened Varying will always contain the same value as `y`.
If we set a new Varying `z` into `x`, the flattened result will move over to track
`z` instead. Maybe that was a bit confusing&mdash;let's see this in action.

~~~
const results = [];

const odds = new Varying(1);
const evens = new Varying(2);
const choose = new Varying('odds');

choose
  .flatMap((which) => (which === 'odds') ? odds : evens)
  .react((x) => { results.push(x); }); // expect 1

choose.set('evens'); // expect 2
evens.set(4); // expect 4
odds.set(3); // expect no change; we're watching evens
choose.set('odds'); // expect 3
return results;
~~~

So when we call `flatMap` instead of `map`, what that means is that we want to
flatten the result of the mapping function. Let's see it in action on our original
example.

~~~
const quota = new Varying(10);
const items = new List([ 1, 1, 3, 8 ]);

const exceededQuota = quota.flatMap((q) =>
  items.watchLength().map((count) => count > q));

return exceededQuota.get(); // inspect(exceededQuota.get());
~~~

Note how we only had to change the outer `map` to a `flatMap`; the inner one only
ever returns a `bool` so there is no reason to `flatMap` it. (But because this is
Javascript, where types are rather lax, it's totally okay to `flatMap` even if
you might not return a Varying. It's just better to be precise if you can.)

You could also `.map(…).flatten()`, or indeed just call `.flatten()` on any
Varying. But it's far more common to just use `flatMap`, because it's more natural
to immediately "fix" the result of a computation alongside the computation itself
than to try to figure out in some other place in your code whether you've gotten
a nested Varying or not.

One last note on flattening&mdash;it only works on one layer at a time. If you
have, for example, a `Varying[Varying[Varying[x]]]`, you'll have to call `flatten`
_twice_ before you get a `Varying[x]`.

Mapping and Reacting: Underlying Mechanics
==========================================

Now that we've discussed _what_ these features are, we should address how it is
they actually work. In the extreme majority of cases, these details shouldn't matter.
But if you're pushing the framework to its limits, or you're working on the internals,
this knowledge will be important.

If you're not really here to learn that sort of thing, it's totally okay to skip
this section entirely and move on to [Multiple Varyings](#multiple-varyings) below.
On the other hand, these subtleties are about as weedy as Janus gets, so if one
of your goals is to risk-assess the darkest corners of the framework, this is the
place to be.

Change Propagation
------------------

The first topic here is the nature of change propagation.

We like to pretend that time doesn't exist in Janus-land, but every form of
functional programming is a lie if you dig deeply enough, and we sadly do have
to push changes out one at a time. The way this works out is that first-registered
reactions will fire first when changes occur. This behavior is not customizable
nor parameterizable: any code that depends on the particular order of propagation
is dangerous and should be rewritten.

Perhaps more interesting is what happens when change waves overlap each other.
The next example is not exactly _advisable_ code, but it does demonstrate the
problem.

~~~
const results = [];
const v = new Varying(2);

// coerce v to an integer always:
v.react((x) => { v.set(Math.round(x)); });

v.react((x) => { results.push(x); });

v.set(3.5);
return results;
~~~

At first, this may not seem too surprising. In fact, it looks like the most
desirable outcome. But two subtleties are at work in this sequence of events.

The first is that we registered the `results.push` reaction _after_ the coercion.
If we hadn't, our results would also include an intermediate `3.5` result. This
is scary, yes, but remember again that this is a rather degenerate code sample.

The second subtlety is that we don't also see a `3.5` _after_ the `4`. Why would
you? Consider the actual underlying sequence of events:

1. `a` is set to `3.5`. It knows it must call `react` handlers 1 and 2.
2. `react` handler 1 is called with `3.5`.
   1. `a` is therefore set to `4`. It knows it must call `react` handlers 1 and 2.
   2. `react` handler 1 is called. It tries to set `4` again so nothing happens.
   3. `react` handler 2 is called. It pushes `4` to `results`.
3. `react` handler 2 is called with `3.5`.
   1. `3.5` is therefore pushed to `results`.

This doesn't seem so bad, necessarily. That `3.5` _did_ happen at some point,
after all, so it seems natural that it should show up in the results array. But
two things make this an unacceptable result. The first is that as far as `results`
are concerned, because it sees the values in reverse order, `4` is _the most recent_
result.

The second problem follows after the first: if, say, instead of being a results
array handler 2 was somehow some other Varying, and so the most recently seen value
_is_ the present value, then it would carry the wrong value. And in fact, as we
will see in the next subsection, `map` does indeed become a `react` at some point
internally, and so `map` would in this scenario also carry the wrong result.

And so each Varying keeps track of which `generation` of value propagation it is
currently sending out. If at any point it senses that it is about to propagate
an old value, one from an older generation, it bails out. So at step 3 in the
above list, when `react` handler 2 is about to called with `3.5`, our actual
Varying knows not to carry through with it.

Map Execution
-------------

The next mechanic to cover is the true nature of `map`. As previously mentioned,
Varying will not bother running `map` functions or carrying values unless it
absolutely must. (By the way, this is part of why we use `.get()` instead of
directly accessing a `value` property&mdash;we might have to do work to answer
the question.)

But we've also previously mentioned that the _only_ ways to get values out of a
Varying are `get` and `react`. There is no super-secret backdoor (yet) that Varying
uses to snoop on its mapping source.

So what a mapping-result-Varying (henceforth referred to as a `MappedVarying`)
actually does is wait around until someone comes along and `react`s on it. When
that happens, it itself `react`s on its source Varying, with a callback that maps
the result and applies it to itself. This way, if a whole chain of Mapped Varyings
are strung together, starting a reaction causes a series of `react`s in turn all
the way back to the Varying source. The opposite is also true: when a Mapped Varying
no longer has any reactions on it, it stops reacting on its source Varying.

A `flatMap`ped Varying is quite similar, except that when it sees a Varying come
through after mapping, it will `react` on _that_ Varying to track its inner value.
Then, if some new value comes along to replace that inner Varying, it makes sure
to stop reacting on it. This way, we are sure to stop work that is no longer needed.

> # Aside
> Actually, `map`, `flatMap`, and `flatten` are all implemented in a single place,
> as `FlatMappedVarying`. Internally, there's a flag that tracks whether to flatten,
> and there is _always_ a mapping function&mdash;`flatten` just assigns `identity`
> as the mapping function which passes the value through unchanged.

Multiple Varyings
=================

Varying provides quite a few ways to deal with multiple varyings at once. The
most direct are `mapAll` and `flatMapAll`:

~~~
const results = [];
const x = new Varying(3);
const y = new Varying(6);

Varying
  .mapAll(x, y, (x, y) => x * y)
  .react((z) => { results.push(z); });

x.set(5);
y.set(1);
return results;
~~~

If you prefer your `map` to actually be called `map`, there is a way to do that
(which of course also works with `flatMap`):

~~~
const results = [];
const x = new Varying(3);
const y = new Varying(6);

Varying.all([ x, y ])
  .map((x, y) => x * y)
  .react((z) => { results.push(z); });

x.set(5);
y.set(1);
return results;
~~~

The truly functional nerd way to do this, though, is to use `lift`. Lifting is
a functional programming operation that takes some function that just deals with
plain values and returns a new "lifted" function that has been taught how to deal
with some particular kind of box that contains those values (in our case, Varying):

~~~
const results = [];
const x = new Varying(3);
const y = new Varying(6);

const multiply = (x, y) => x * y;
const multiplyVaryings = Varying.lift(multiply);

multiplyVaryings(x, y).react((z) => { results.push(z); });
x.set(5);
y.set(1);
return results;
~~~

The one thing you'll note about all these examples is that they always reduce the
multiple parameters down to a single output value _before_ we `react` on them.
This is a pretty natural result of the fact that functions only return one value.
But if you are doing something complicated and expensive (like rendering some
canvas graphics, say) and you just want to apply some mutation every time any one
of several inputs change, `Varying.all` has the answer for you:

~~~
const results = [];
const x = new Varying(3);
const y = new Varying(6);

Varying.all([ x, y ]).react((x, y) => { results.push(x * y); });

x.set(5);
y.set(1);
return results;
~~~

Resource Management
===================

Once again, this section is not essential reading for the majority of practical
cases. It's rare that you'll have to create one of these on your own. But again,
it is something that will come up when you peruse Janus internals, or if you are
doing fancier things. In the interest of providing a full theoretical foundation,
we'll delve into it here.

It feels like we've already talked quite a bit about resource management, especially
if you read the [Underlying Mechanics](#underlying-mechanics) section above. But
what we've discussed so far in this direction pertains just to Varyings themselves.
What happens if providing a value for a Varying involves generating some expensive
resource?

> # Aside
> This is another spot where we should talk about other FRP systems for a moment.
> Many of them distinguish between ["hot" and "cold" observables](https://alligator.io/rxjs/hot-cold-observables/).
> It's&hellip; all actually rather quite complicated when you first run into it,
> and it actually has to do with where the observable values _originate_ from
> (remember that in conventional FRP, observables represent _streams of values_
> over time).
>
> In practice, what it means is that you have to be a bit careful writing and
> consuming observables in case you, for example, end up making the same network
> request over and over again just by subscribing to the same observable more
> than once. In Janus, there is only one Varying.

As always, the goal is to be as lazy as possible. If, say, we need to generate a
Varying whose value relates to a bunch of math on all the terms of a List (which,
because this is Janus, must be continually kept up to date every time one of the
terms change), we still want to be able to return that Varying, but we don't want
to do and continually maintain all that math unless somebody cares.

So, the first question is: how do we tell if somebody cares?

Varying provides a very primitive tool and a somewhat fancier one to help solve
this problem. The primitive one is `Varying.refCount()`:

~~~
const results = [];
const v = new Varying(42);
v.refCount().react((count) => { results.push(count); });

const observable1 = v.react(() => null);
const observable2 = v.react(() => null);
observable1.stop();
observable2.stop();
return results;
~~~

`refCount` is _itself_ a Varying, so you can return your inert Varying but listen
to its `refCount`, and start performing the expensive computation right when it's
actually needed. The sequence of events is carefully orchestrated so that `refCount`
will update (and so any code you write that handles `refCount` will run), and _then_
the present value of the Varying will be handed to the `react` callback, so you
have a window to sneak the correct answer in there:

~~~
const results = [];
const v = new Varying(0);
v.refCount().react((count) => { if (count > 0) v.set(42); });

v.react((x) => { results.push(x); });
return results;
~~~

But this all sounds quite repetitive. Surely there is some way to hand off all
of that homework, and just focus on what matters.

~~~
class ExpensiveClass {
  result() { return 42; }
  destroy() {
    // free up resources..
  }
}
class AnotherExpensiveClass extends ExpensiveClass {}

const v = Varying.managed(
  (() => new ExpensiveClass()),
  (() => new AnotherExpensiveClass()),
  (expensive, anotherExpensive) => Varying.of(expensive.result())
);

const results = [];
// this forces the expensive classes to be created:
const observable = v.react((x) => { results.push(x); });
// and this calls destroy() on them:
observable.stop();
return results;
~~~

The `Varying.managed` method takes a bunch of functions that each returns some
kind of expensive resource, and a final function that takes those resources and
returns a Varying with the correct answer. It hangs on to all of these things
until somebody comes along and `get`s or `react`s on it, at which point it calls
all the resource functions, and hands those resources off to your function that
gives the correct Varying result.

When nobody cares again, it frees up those resources.

Freeing up those resources is worth a quick look: you'll see repeatedly in Janus
the method `destroy()`, which we call whenever we think we don't need an instance
anymore. This is your chance to clear event listeners, remove foreign references
that might trip up the garbage collector, and so on.

Recap
=====

That was a whole ton of reading. Here's a quick reminder of what we've just covered:

* Varyings contain a value that might change over time.
* You can `get` the value of a Varying at any point in time, or `react` on it to
  do some action every time it changes.
* You can also `map` a Varying, which gives you a new Varying which always contains
  the original value mapped by your function. Use `flatMap` if your function might
  itself return a Varying.
* If you have many Varyings, all of whose values you need to compute some result,
  you can use `Varying.all`, `.mapAll`, `.flatMapAll`, or `.lift`.
* You can see how many people are currently reacted on a Varying using `.refCount`.
* If you have expensive resources to marshal or computations to kick off, you can
  use `Varying.managed`.

That's the hardest stuff. We went into relatively excruciating detail here
because&mdash;well, for one, you signed up for it, but also&mdash;this knowledge
here forms the base for everything else we are going to do in Janus. Very little
from this point forward will look unfamiliar at all: we are going to talk about
things like Maps and Lists and Models, and these things will all look exactly
like you would expect, just flavored by the existence of Varying.

Next Up
=======

So, take another moment. Make sure you're comfortable with the ideas presented
here. Go back and play with some of the examples. Come up with practical scenarios
and boil them down into little values you can play with and string together.

When you're feeling ready, we'll cover the second of the three coremost Janus
concepts, which are [case classes](/theory/case-classes). Don't worry, they're
basically just fancy `enum`s that can contain a value.
