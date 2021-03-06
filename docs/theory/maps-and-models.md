Maps and Models
===============

We've already seen quite a lot of `Map`s and `Model`s in our examples so far.
They haven't gotten much explanation, because we've assumed that the notion of
a key/value data structure and some notion of continually watching what exists
at some key over time are sensible enough without much explanation.

And, we're not going to beat that point any further here. Instead, we are going
to explore some (but not all) of the more powerful data transformations you can
perform with Maps, and what Models add to the picture.

In Janus, a Model is just a fancy Map. Where Maps are key/value stores and carry
all the functionality associated with that data structure, including the useful
transformations you might need to perform on it, Models `extend` Map to add
application-specific behavior like data types, serialization, validation, and
more.

In particular, here is what we're going to cover for Maps:

* Basic key/value operations like `get`, `get_`, and `set`.
* Shadow-copied Maps, allowing data to be layered together.
* Enumeration and mapping.

And on top of this, Models offer these areas that we will explore:

* Databound keys.
* Named attributes with customizable behavior.
  * Default values and (de)serialization are some of these behaviors.
  * We will also cover some more-special cases like Enum attributes.
* Validation.

While we will briefly touch on serialization as a part of this chapter, a full
survey and understanding can be found in the Further Reading chapter on [Traversals](/further-reading/traversal),
upon which serialization is actually implemented and in which can be found its
full power.

Likewise, we will not be covering the Reference attribute in depth here, which
allows Model keys to reference some (remote, typically networked) absent resource
that should be fetched when the key is observed. We will get into Reference and
its friends in the [next chapter](/theory/requests-resolvers-references).

Maps
====

You've already seen Maps used a lot, but we've tried to limit even the basic
operations to some simple forms to avoid confusion. So let's start over and review
the basics, complete with alternate invocations.

~~~
const data = new Map({ id: 42, initial: 'values', go: 'here' });
data.set('but', 'more');
data.set('can', { be: { provided: 'later' } });
data.set('can.be.set', 'deeply');
data.set({ or: 'directly', by: 'object' });

const setter = data.set('currying');
setter('is supported!');

const v = Varying.of(42);
v.react(data.set('convenient'));
v.set('it can be');

data.set('oops', 'do not set nullish values to clear keys');
data.unset('oops'); // instead, use .unset()

return inspect.panel(data);
~~~

Once set, `.get` and `.get_` can be used to watch or fetch keys.

~~~
const data = new Map({ id: 42, nested: { value: 'here' } });
return [
  data.get_('id'),
  data.get_('nested'),
  data.get_('nested.value'),
  data.get('id'),
  data.get('nested'),
  data.get('nested.value')
].map(inspect);
~~~

Simple enough; you can even get an entire subobject at once if you want (see `nested`
in the sample above). But there are some things to watch out for if you do this,
and it's generally a good idea to only get individual values at a time if you can
help it.

> # Warnings
> To expand on that, think about what it means to `.get('nested')` here. Recall
> that Varying will not react unless the value _actually changes_, and that comparison
> is done with `===`. So unless the actual substructure object itself is replaced
> with another one (ie the reference changes), `.get`ting it isn't likely to be
> very useful.
>
> In addition, when you `.get_('nested')`, be very careful not to modify the structure
> you get back, since it's the actual object the Map is using to maintain its own
> structure. If you mess with it, the Map will get out of sync with itself.

So that's all the basic stuff. Next, let's talk about shadow-copies.

Shadow-Copied Maps
------------------

Calling `.shadow()` on a Map will give you a new Map that inherits its data from
the original: changes to the original (the shadow parent) will show up in the shadow
copy, but the shadow can accept its own data, which will locally override that
of the parent.

Here's an example:

~~~
const data = new Map({ name: 'Gadget', age: 8, owner: 'Jane' });
const shadow = data.shadow();

data.set('name', 'Gadget!');
shadow.set('age', 9);
shadow.set('color', 'black and white');
shadow.unset('owner');

return [ data, shadow ].map(inspect.panel);
~~~

So a shadow can override or unset present parent values, or create new values
where the parent doesn't have any. Any untouched values will carry through to the
shadow.

Many interesting applications are possible, but shadows are most commonly useful
when you have some data you've loaded from the server, and the user enters some
sort of edit view for it. Then, you can create a shadow copy of the canonical data
that you hand to the edit view, and should the user abort the edit operation you
still have the original laying around.

In that case, your application would typically either serialize the edited shadow
to the server, whereupon you'd get new canonical data back that you can use instead
of the original set, or if the user aborts you can simply discard the shadow. For
that and other use cases, a handful of other methods are available:

~~~
const data = new Map({ name: 'Gadget', age: 8, owner: 'Jane' });
const shadow = data.with({ owner: 'Lindsay' });

shadow.set('name', 'Gadget!');
shadow.revert('owner');

return shadow.modified();
~~~

The `.with({ … })` shortcut makes a shadow and then immediately `.set`s the given
data, which can be useful in single-expression mapping lambdas. `.original()`
will always get you the root Map in a shadow chain; if you call it on an original
rather than a shadow it'll give itself back.

`.revert(key)` will undo a shadow override at a given location (unlike `.unset(key)`,
which explicitly overrides a location with empty data).

A shadowed Map will automatically `.shadow` any nested Maps or Lists it contains
when `.get`ting or `.get_`ting them. (Lists also implement `.shadow`, but really
it's more of a cloning operation and it is done mostly so that this property, that
shadowed structures automatically shadow their entire nested tree, stays true.)

Lastly, the `.modified()` operation tells you whether the Map has changed
compared with its original. It's actually just a shortcut to `shadow.diff(shadow.original())`,
which compares any two collections, and actually does so quite intelligently;
consider this sample, for instance:

~~~
const a = new Map({ name: 'Gadget', age: 8, owner: new Map({ name: 'Jane' }) });
const b = new Map({ name: 'Gadget', age: 8, owner: new Map({ name: 'Jane' }) });
return a.diff(b);
~~~

It understands that they are the same despite the nested Maps that are different
instances. Like serialization, this is all accomplished through [Traversals](/further-reading/traversal),
which give you enormous flexibility and customizability over the process. You
can, for instance, override the diffing algorithm to ignore or apply special logic
to particular keys, for instance. Take a look at the linked chapter for more
information.

Enumeration
-----------

Like most Maps, you can get a List of the keys a Janus Map contains. Like most
structures in Janus, this List is kept up to date as the Map changes.

~~~
const data = new Map({ name: 'Gadget', age: 8, owner: { name: 'Jane' } });

const keys = data.enumerate();
const pairs = keys.flatMap(key => data.get(key).map(value => `${key}: ${value}`));

data.set('owner.age', 27);

return inspect(pairs);
~~~

You can imagine that this sort of thing might be useful when you don't know in
advance what exactly a Map schema might look like, for instance if there are
user-defined custom properties in it.

> You can use `.enumerate_()` to get a static array of keys instead. If you don't
> like these names, you can use `.keys()` and `.keys_()` instead, respectively.

It can also be very useful when you need a list of some things, for instance to
render all of them on the page, but you also need to be able to rapidly look one
up by some identifier. You can formulate the data as a Map fundamentally, but get
an enumeration when you need a List.

~~~
const people = new Map({
  alice: new Map({ name: 'Alice Wonderlonious', bff: 'bob' }),
  bob: new Map({ name: 'Bob Cat', bff: 'alice' }),
  chelsea: new Map({ name: 'Chelsea Neuyok', bff: 'david' }),
  david: new Map({ name: 'David Pelapi', bff: 'chelsea' })
});

const PersonView = DomView.build(
  $('<div><span class="name"/> (BFF: <span class="bff"/>)</div>'),
  template(
    find('.name').text(from('name')),
    find('.bff').text(from('bff').flatMap(bff =>
      people.get(bff).flatMap(person => person.get('name'))))));

return people.enumerate().mapPairs((_, person) => new PersonView(person));
~~~

Here, we need to be able to look up a person's full name from some identifier in
order to display their BFF, so storing them by key/value pairs makes sense. But
we also want to render all of the people we know about, so we get an enumeration
of that Map.

> # Aside
> You may have noticed that we cheated a little bit in this example, and we
> directly reference `people` as a closure scope variable from the template.
> Typically, you would pass this sort of context using View Models, or copying
> parent references, or skip passing context and rely on [View Navigation](/theory/views-templates-mutators#view-navigation)
> to jump up the hierarchy to the `.closest_(People)`, for example.

This time around, rather than all the homework of `.enumerate().flatMap(key => data.get(key).map(value =>  …))`
we use `.enumerate().mapPairs((key, value) => …)`, which is a convenience
shortcut offered by the Enumeration List. This is different from calling `.mapPairs`
directly on Map, which you'll be seeing in the following section: calling `.enumerate`
first gets you a List, and so when you chain `.mapPairs` onto that you'll get another
List, which is what we want here. Calling `.mapPairs` directly on Map maps the Map
over to another Map.

Mapping
-------

Yes, you can also map Maps. The resulting Map will have exactly the same key
structure, but will have values mapped by your given function.

~~~
const balances = new Map({ alice: 23.16, bob: 10.74, chelsea: 29.93 });
const doubled = balances.mapPairs((key, value) => value * 2);
return inspect.panel(doubled);
~~~

This mapped Map will stay up-to-date with its original whenever the original changes:
additions, changes, and removals to data on the original will result in changes
to the mapped Map. But as usual, you can use `flatMapPairs` instead of `mapPairs`
if your mapping also needs to change in response to some other input and so it
might return a Varying. That's the case in this innocent little scheme. (Nobody
will notice, don't worry.)

~~~
const balances = new Map({ alice: 23.16, bob: 10.74, chelsea: 29.93 });
const adjusted = balances.flatMapPairs((key, value) => (key === 'chelsea')
  // for chelsea, add 5 cents for every other account in the system.
  ? balances.length.map((numAccounts) => value + (0.05 * (numAccounts - 1)))

  // otherwise, deduct 5 cents.
  : value - 0.05);

// alice makes a deposit..
balances.set('alice', balances.get_('alice') + 5);

return inspect.panel(adjusted);
~~~

Remember, this is Javascript so we're pretty loose and flexible about exact types.
You can return static (not `Varying`) values to a `flatMap` and it'll just go along
with it. We take advantage of this above to avoid all the work of counting the number
of accounts unless it actually matters.

Models
======

Now that we have our fundamental key/value data structure and a toolbox of tricks
for transforming it, we can talk about Models. Models add three primary areas of
concern to Maps:

* Databound keys
* Custom attribute behavior at particular keys
* Validation

You are free to use none or all of these facilities as best suits your purpose.
You can always also define your own methods, for instance to codify particular
data operations for use by other areas of your application.

We'll start by covering the simplest, and the most familiar of the three above.

Model Bindings
--------------

Any Model key can be bound to some calculation based on other values available
to that model. Here is a simple example: our Model contains a reference to some
nested Model, but what our server wants to see is actually the foreign key reference
to that subentity, not the full data. The syntax to accomplish this should look
extremely familiar if you recall the chapter on [Views](/theory/views-templates-mutators).

~~~
const SubEntity = Model.build();
const Entity = Model.build(
  bind('subentity_id', from('subentity').get('id'))
);

const entity = new Entity({ subentity: new SubEntity({ id: 42 }) });
// entity.unset('subentity'); // uncomment to clear the subentity out
return inspect.panel(entity);
~~~

Of course, we still need to _omit_ sending the full subentity to the server, but
that will be easy once we cover `attribute`s next.

As you can see, `bind` works a lot like `find` did in templates earlier, and the
Model itself is used as the context for the data references. These bindings can
be cascaded to make complex series of operations more palatable.

This example is quite long but it demonstrates some important points that are worth
diving into, so give the sample result a try (drag your mouse around on it), study
the code for a moment, and we'll chat about it afterwards.

~~~
const { floor, ceil, min, max } = Math;
const px = (x => `${x}px`);
const makeTicks = (count => (new Array(count + 1)).fill().map((_, idx) => idx));

// Segmented Axis:
class SegmentedAxis extends Model.build(
  // expects: width: px of draw area, ticks-count: count,
  //          mouse-clicking: bool, mouse-now: x px

  bind('segment-width', from('width').and('ticks-count').all.map((w, t) => w / t)),

  bind('mouse-min', from('mouse-down').and('mouse-now').all.map(min)),
  bind('mouse-max', from('mouse-down').and('mouse-now').all.map(max)),

  bind('selection-left', from('mouse-min').and('segment-width')
    .all.map((x, w) => floor(x / w) * w)),
  bind('selection-right', from('mouse-max').and('segment-width')
    .all.map((x, w) => ceil(x / w) * w)),

  bind('ticks-idxs', from('ticks-count').map(makeTicks)),
  bind('ticks-objs', from('ticks-idxs').and.self().all.map((idxs, axis) =>
    new List(idxs).map(index => new Tick({ index, axis }))))
) {
  _initialize() {
    this.reactTo(this.get('mouse-clicking'), clicking => {
      if (clicking === true) this.set('mouse-down', this.get_('mouse-now'));
    });
  }
}

class SegmentedAxisView extends DomView.build(
  $('<div class="axis"><div class="selection"/><div class="ticks"/></div>'),
  template(
    find('.selection')
      .classed('hide', from('mouse-clicking').map(x => !x))
      .css('left', from('selection-left').map(px))
      .css('width', from('selection-right').and('selection-left')
        .all.map((right, left) => px(right - left))),

    find('.ticks').render(from('ticks-objs')),

    find('.axis')
      .on('mousedown', (_, subject) => { subject.set('mouse-clicking', true); })
      .on('mousemove', (e, subject) => { subject.set('mouse-now', e.offsetX); })
      .on('mouseup', (_, subject) => { subject.set('mouse-clicking', false); })
)) {
  _wireEvents() {
    const dom = this.artifact();
    this.reactTo(
      // a handy utility provided by the stdlib to form a Varying from events:
      stdlib.varying.fromEvent($(window), 'resize', (() => dom.width())),
      this.subject.set('width'));
  }
}

// Tick marks:
const Tick = Model.build(
  bind('left', from('index').and('axis').get('segment-width')
    .all.map((idx, segWidth) => idx * segWidth)));

const TickView = DomView.build($('<div class="tick"/>'), find('.tick')
  .text(from('index'))
  .css('left', from('left').map(px)));

// Final assembly:
const app = new App();
stdlib.view($).registerWith(app.views);
app.views.register(SegmentedAxis, SegmentedAxisView);
app.views.register(Tick, TickView);

const axis = new SegmentedAxis({ 'ticks-count': 10 });
return [ app.view(axis), inspect.panel(axis) ];
~~~
~~~ styles
.axis {
  height: 200px;
  margin-bottom: 15px;
  position: relative;
}
.axis .selection {
  background: rgba(200, 200, 200, 0.3);
  bottom: 0;
  box-shadow: 0 0 0 1px rgba(200, 200, 200, 0.7) inset;
  pointer-events: none;
  position: absolute;
  top: 0;
}
.axis .ticks {
  border-top: 1px solid #000;
  left: 0;
  position: absolute;
  right: 0;
  top: 100%;
}
.axis .ticks .tick {
  line-height: 20px;
  margin-left: -10px;
  position: absolute;
  text-align: center;
  width: 20px;
}
.axis .ticks .tick:before {
  border-left: 1px solid #000;
  content: '';
  display: block;
  height: 4px;
  left: 50%;
  position: absolute;
}
.axis li:first-child .tick {
  margin-left: 0;
  text-align: left;
}
.axis li:first-child .tick:before {
  left: 0;
}
.axis li:last-child .tick {
  margin-left: -20px;
  text-align: right;
}
.axis li:last-child .tick:before {
  left: auto;
  right: 0;
}
~~~

If you think about how you might have otherwise built this interaction, it actually
becomes quite complex. There are a lot of different values that enter this system
at different times, and trying to update only what's needed piecemeal leads to
really complex subdivisions of code, while recomputing absolutely everything every
time is expensive.

Instead, with this approach we have some essential facts that we feed to the Model
one direct binding at a time, and we let all the computation fall out of it. This
insistence on minimizing the number of truth variables and how each is sourced can
be seen by the way we manage `mouse.down`: rather than just set it as part of our
`mousedown` event handler, we have the Axis Model instead enforce itself that when
`clicking` becomes true, we copy `mouse.now` to `mouse.down` at that moment.

By making this relationship an inherent rule of computation, we ensure that if,
say, a new spot in the code also sets `clicking` to be true, it doesn't have to
concern itself with setting `mouse.down` correctly.

The more concise and direct we are with core truth and how it is set, the more of
our system we push into our purely-functional, always-correct land, and the fewer
complications we introduce into our application.

> We have the Model do this point-in-time copy by implementing its `_initialize`
> method, which is called just after the initial data has been injected into the
> Model and databinding has begun. We use `this.reactTo` rather than just calling
> `this.get('mouse.clicking').react(…)` for purposes of [resource management](/theory/resource-management).
>
> You see the same `.reactTo` method called in the `_wireEvents` body, for the
> same reason.

The intermediate variables, then, each encapsulate some useful derived fact from
that base truth, each of which is recomputed and updated only when it must be.
Each fact is small, purely functional, and relatively easy to glance at and verify.
Line ordering is no longer a stylistic nor correctness concern: we only have to
convince ourselves that each mapping function is correct, rather than having to
worry about the ordering or invocation states of the whole assembly. There is some
concept of computational order encoded in each `from` binding, but as a whole our
set of `bind` statements are coequal facts, not sequential operations. They can
be organized at will.

And perhaps most importantly, we can see here how Models can represent data objects,
yes, but they can also be used as _problem-solving spaces_, where related computations
are performed in a locally shared scope and the results can be picked up by other
parts of your application, like Views.

Binding, then, is very powerful indeed.

Model Attributes
----------------

But if we turn our attention back to pure data modelling for a moment, we are still
missing some concept of an actual data schema. How, for example, do we know which
data editors to render for which attributes, or which Model classes to inflate
to when deserializing nested JSON data?

This is what `attribute`s are for, which are declared in `Model.build` much like
`bind`:

~~~
class Person extends Model {}

const Dog = Model.build(
  attribute('status', class extends attribute.Enum {
    initial() { return 'available'; }
    values() { return [ 'adopted', 'pending', 'available' ]; }
  }),

  attribute('owner', class extends attribute.Model {
    static get modelClass() { return Person; }
  })
);

return [
  new Dog({ name: 'Gadget' }),
  Dog.deserialize({ name: 'Spot', status: 'adopted', owner: { name: 'Jenny' } })
].map(inspect.panel);
~~~

So `attribute` and `bind` statements live alongside each other in the Model builder,
and the actual properties and behavior of specific attributes are defined by way
of a class deriving from some `attribute` type. The initial types are:

* Simple primitives: `Text`, `Boolean`, `Number`.
* `Date`, which wants `Date` objects in working data but serializes to and from
  epoch milliseconds.
* `Enum`, which fundamentally works with Strings but has a notion of its available
  possible values.
* `Model` and `List` expect their respective structure types, and are mostly used
  to simplify (de)serialization.
* `Reference` manages a reference to a remote data resource. It gets its [own
  entire chapter](/theory/requests-resolvers-references).

All attribute types share a few methods in common. One of these is `.initial()`,
which you see above. Initial values are not eagerly injected into the data, but
rather lazily pulled on `.get()` or `.get_()`. Alongside `.initial` is `.writeInitial`,
whose purpose we also demonstrate here:

~~~
class Person extends Model {}
const Dog = Model.build(
  attribute('status', class extends attribute.Enum {
    initial() { return 'available'; }
    values() { return [ 'adopted', 'pending', 'available' ]; }
  }),

  attribute('owner', class extends attribute.Attribute {
    initial() { return new Person(); }
  })
);

const spot = new Dog({ name: 'Spot' });
const gadget = new Dog({ name: 'Gadget' });
gadget.get_('owner').set('name', 'Jenny');

return [
  spot.get_('status'),
  spot.data.status, // a reference to the internal data structure
  gadget,
  gadget.get_('owner'),
  gadget.get_('owner').get_('name')
].map(inspect.panel);
~~~

Spot's internal data doesn't have a `status`, nor did Gadget end up with an owner
named Jenny.  This is because neither attribute set `.writeInitial` to true. In
the case of `status`, this just means the value is ethereal each time it is fetched.

In the case of `owner`, it's even more confusing: because a new initial `Person`
is generated each time, the Person we name Jenny just disappears immediately.

When `.writeInitial` is set to true, the initial value is persisted whenever it
is fetched. (_Not_ when the Model is generated! It's still a lazy value.) Because
forgetting this detail and neglecting to set `.writeInitial` can lead to especially
confusing behavior for Models and Lists, `attribute.Model` and `attribute.List`
set `true` for `.writeInitial`&mdash;this is why we used the generic base class
`attribute.Attribute` in the sample above when we wanted to show the wrong behaviour.

Here's another sample with these issues fixed, and which demonstrates a little
shortcut for all this anonymous class stuff:

~~~
class Person extends Model {}
const Dog = Model.build(
  attribute('status', class extends attribute.Enum {
    get writeInitial() { return true; }
    initial() { return 'available'; }
    values() { return [ 'adopted', 'pending', 'available' ]; }
  }),

  initial.writing('listed', true, attribute.Boolean),

  attribute('owner', class extends attribute.Model {
    get modelClass() { return Person; }
    initial() { return new Person(); }
  })
);

const spot = new Dog({ name: 'Spot' });
spot.get_('owner').set('name', 'Jenny');

return [
  spot.get_('status'),
  spot.get_('listed'),
  spot
].map(inspect.panel);
~~~

If you don't want your attribute to write its initial value, you can omit `.writing`,
and if you don't care about the type of the attribute, you don't need to provide
the third argument.

The `Model` and `List` attributes have overridable instance properties `modelClass`
and `listClass`, respectively, which define the type of value they expect to contain.
This is used mostly for deserialization, which we will cover next.

> There are also many shortcuts for these attributes. `attribute.Model.of(Person)`,
> for example, will return an attribute class with a `modelClass` property of `Person`.
> These are all described in the [API Documentation](/api/attribute).

Attribute Serialization
-----------------------

The `.serialize` and `@deserialize` methods are also standard for all attributes.
They can be implemented to override the standard (de)serialization behaviour for
the value at that key, and are straightforward:

~~~
const Dog = Model.build(
  // say the server communicates numbers as strings:
  attribute('age', class extends attribute.Number {
    serialize() { return this.getValue_().toString(); }
    static deserialize(data) { return parseFloat(data); }
  }),

  bind('dog-age', from('age').map(x => x * 7)),
  attribute('dog-age', class extends attribute.Number {
    get transient() { return true; }
  })
);

return [
  Dog.deserialize({ name: 'Gadget', age: '7', city: 'Seattle' }),
  (new Dog({ name: 'Spot', age: 4 })).serialize()
].map(inspect.panel);
~~~

The default `Model` and `List` attribute deserializers find and use their declared
`modelClass` or `listClass` `@deserialize` method, which you may also override.

Marking an attribute as `.transient` will, if the default `.serialize` is in use,
omit that property from the serialization.

> As with `initial`s, there is a shortcut to invoke this: `transient('key')`.

Attribute Editors
-----------------

Another big function attributes provide is to serve as classtypes we can latch
onto when trying to `render` editors for our attributes, as well as to define
properties about the data and therefore how the editors should function. The [Janus
Standard Library](/stdlib) provides general-purpose editors for all the default
types; a good example focuses around the `Enum` attribute type:

~~~
// Models:
const Document = Model.build(
  initial('name', 'Untitled', attribute.Text),
  attribute('content', attribute.Text)
);
const Window = Model.build(
  initial.writing('documents', () => new List([ new Document() ])),

  attribute('current-document', class extends attribute.Enum {
    initial() { return this.model.get_('documents').at_(0); }
    _values() { return from('documents'); }
  })
);

// Views:
const DocumentEditView = DomView.build(
  $('<div class="document"><div class="title"/><div class="content"/></div>'),
  template(
    // here we use from.attribute:
    find('.title').render(from.attribute('name')),
    // here we directly call #attribute:
    find('.content').render(from.subject().map(doc => doc.attribute('content')))
      .criteria({ style: 'multiline' })));

const DocumentSummaryView = DomView.build(
  $('<div class="document-summary"/>'),
  find('.document-summary').text(from('name')));

const WindowView = DomView.build($(`
  <div class="window">
    <div class="documents">
      <div class="doc-list"/>
      <button class="new-doc">&oplus;</button>
    </div>
    <div class="current"/>
  </div>`), template(
  find('.documents .doc-list').render(from.attribute('current-document'))
    .criteria({ style: 'list' })
    .options({ renderItem: (x) => x.context('summary')}),
  find('.current').render(from('current-document')),

  find('.documents .new-doc').on('click', (_, subject) => {
    subject.get_('documents').add(new Document()); })));

// Assembly:
const app = new App();
stdlib.view($).registerWith(app.views);
app.views.register(Document, DocumentEditView);
app.views.register(Document, DocumentSummaryView, { context: 'summary' });
app.views.register(Window, WindowView);

return app.view(new Window());
~~~
~~~ styles
.window .documents {
  overflow: hidden;
}
.window .doc-list,
.window .doc-list .document-summary,
.window .new-doc {
  float: left;
}
.window .document-summary {
  cursor: default;
  font-size: 1.2em;
  padding: 0.3em 0.7em 0.1em;
  position: relative;
}
.window .document-summary.checked {
  background-color: #d7d7d7;
}
.window .new-doc {
  background: none;
  border: none;
  font-size: 1.4em;
  font-weight: bold;
  height: 1em;
  margin-left: 0.5em;
  outline: none;
  padding: 0;
}
.window .current {
  background-color: #d7d7d7;
  border-radius: 0 0 0.2em 0.2em;
  padding: 1em;
}
.window .document .title {
  border-bottom: 1px dotted #999;
  margin-bottom: 0.8em;
  padding-bottom: 0.5em;
}
.window .document .title input {
  background: none;
  border: none;
  font-size: 1.6em;
  font-weight: bold;
  margin: 0;
  outline: 0;
  padding: 0;
  width: 100%;
}

.window .document .content textarea {
  background: #f7f7f7;
  border: none;
  height: 20em;
  max-width: 100%;
  min-width: 100%;
  outline: 0;
  width: 100%;
}
~~~

Once again, we demonstrate several points in this sample. We show how attribute
editors are rendered with the standard library, but we also illustrate some broader
points about problem-solving in Janus.

As far as `render`ing attributes is concerned, we show the use of `from.attribute('key')`
as well as directly calling `.attribute` on a `Model` instance to pull up the Attribute
object representing the behavior of that key, rather than the value residing at
the key. Once that attribute class instance is resolved from the `from` chain,
`render` will search for a matching view registration like it would for any other
class instance.

We register all the `stdlib` views so it'll find its views for our attribute classes.
The particular `context` and `style` values you see are simply the convention
applied throughout the standard library&mdash;they are not core to Janus itself.

You can also see that the Enum attribute `values()` method is allowed to return
a `from` expression instead of a `List` (or, for that matter, a `Varying` would
work too, so we could have written `this.model.get('documents')`). This fact
is natural in the context of a framework where we strive to deal gracefully with
changes, and in this case it helps us solve the problem here of managing a set
of tabbed views.

As we've began to stress, problem solving in Janus often boils down to data modelling.
It would be entirely possible to create some ad-hoc jQuery-driven method for
listening to some List of documents and rendering the appropriate view when tabs
are clicked, updating the list of tabs and the actively-selected one as needed.

Or, you can think about the problem in a different way, and consider it from a
data modelling perspective: what, fundamentally is the purpose of a tab bar? It's
to choose one of a known set of options. There is some object that is the selected
value, and there is some known list of options of which that object is one. This
is exactly an Enum attribute, and by modelling our data structure after that
interpretation, we can simplify the entire problem drastically, relying on the
prebuilt standard library views to accomplish our task.

The end result of this is that not only have we saved ourselves a lot of work,
we've grounded the resulting implementation entirely in simple data operations.
Notice how the _only_ custom event handler, the only imperative code we wrote,
does nothing more than add a new Document to the list. There is almost no opportunity
to make a coding error, once the data has been structured correctly.

> Again, we will not be covering Reference attributes in this chapter, as they
> get explained alongside Requests and Resolvers, which are the mechanisms whereby
> Reference attributes actually acquire values.
>
> There is also, by the way, no reason you can't define your own Attribute types
> specific to your application.

Model Validation
----------------

The very last topic to overview about Models is that of validation. Janus provides
a relatively lean interface for model validation: you may define one or more validation
rules. Each of these are just `from` expressions that result in one of the `janus.types.validity`
case classes: `valid`, `warning`, or `error`. There are standard methods to get
the outstanding failing rules, or all the validation bindings, or just whether
the Model is passing validation or not.

We want to provide a standard interface at all here, for reasons much like our
motivations behind [case classes](/theory/case-classes#a-practical-example) in
the first place: to give a basic common language for this process within Janus,
to promote interoperability and reusability with minimal glue and configuration.
The [Manifest](/theory/app-and-applications), for instance, which helps manage
server-side render lifecycles, uses Model validation to determine whether it
should return your rendered view/page as a successful result or fault over to
some error page instead.

On the other hand, we want to provide the smallest interface possible, to enable
a broad range of approaches to the problem space. Do you want to encode information
about which fields are failing the validation? Nest it (as another case class,
perhaps?) within the `valid`/`warning`/`error` case class. Do you want to declare
validation rules in some way other than the Janus default? You have exactly one
method to implement to make the standard machinery work.

> That one method you'd need to implement, by the way, is `.validations()`, which
> ought to return a `List[types.validity]`.

Here, we stick to the Janus default. You will not be surprised to learn that
validation rules are specified alongside `bind`s and `attribute`s as a part of
`Model.build`. We also demonstrate `.valid`, which returns a `Varying[boolean]`
indicating whether all validation rules are passing, and `.errors`, which returns
a List of only the failing validation results.

~~~
const Person = Model.build();
const Dog = Model.build(
  attribute('status', class extends attribute.Enum {
    default() { return 'available'; }
    values() { return [ 'adopted', 'pending', 'available' ]; }
  }),

  validate(from('name').map(name => (name == null)
    ? types.validity.error('All pets must have names.')
    : types.validity.valid())),

  validate(from('status').and('owner').all.map((status, owner) =>
    ((owner != null) && (status !== 'adopted'))
      ? types.validity.error('Only adopted pets may have owners assigned.')
      : types.validity.valid()))
);

const spot = new Dog({ name: 'Spot', owner: new Person({ name: 'Jenny' }) });
const dog = new Dog();
const gadget = new Dog({ name: 'Gadget' });

return [
  spot.validations(), spot.valid(), spot.errors(),
  dog.valid(), dog.errors(),
  gadget.valid(), gadget.errors()
].map(inspect);
~~~

Translating this information into feedback for the user is left to applications
to work out. Here is one example of how it may be done:

~~~
const { valid, error } = types.validity;
const Issue = Model.build();
const isBlank = (x => (x == null) || (x === ''));

// model helpers to reduce some boilerplate:
const check = (condition, message, fields) => (...args) => condition(...args)
  ? error(new Issue({ message, fields })) : valid();

const Dog = Model.build(
  attribute('name', attribute.Text),

  attribute('status', class extends attribute.Enum {
    default() { return 'available'; }
    _values() { return [ 'adopted', 'pending', 'available' ]; }
  }),

  // note that we just use Text for owner for this one to keep things simple.
  attribute('owner', attribute.Text),

  validate(from('name').map(check(isBlank,
    'All pets must have names.', [ 'name' ]))),

  validate(from('status').and('owner').all.map(check(
    ((status, owner) => !isBlank(owner) && (status !== 'adopted')),
    'Only adopted pets may have owners assigned.', [ 'owner', 'status' ])))
);

// view helpers, again to reduce boilerplate:
const applyValidationClass = (field) => find(`.${field}`).classed('invalid',
  from.self(view => view.subject.errors()).flatMap(errors =>
    errors.any(issue => issue.get_('fields').includes(field))));

const renderField = (field) => template(
  applyValidationClass(field),
  find(`.${field} .input`).render(from.attribute(field)));

const DogEditor = DomView.build($(`
  <div class="dog-editor">
    <div class="errors"/>
    <label class="line name">Name <span class="input"/></label>
    <label class="line status">Status <span class="input"/></label>
    <label class="line owner">Owner <span class="input"/></label>
  </div>`), template(
  find('.errors').render(from.self(view => view.subject.errors())),
  renderField('name'),
  renderField('status'),
  renderField('owner')));

const IssueView = DomView.build($('<span/>'),
  find('span').text(from('message')));

const app = new App();
stdlib.view($).registerWith(app.views);
app.views.register(Issue, IssueView);
app.views.register(Dog, DogEditor);

return app.view(new Dog());
~~~
~~~ styles
.dog-editor .errors {
  margin-bottom: 0.8em;
}
.dog-editor .errors span {
  color: red;
  display: block;
  font-weight: bold;
}
.dog-editor .errors span:before {
  content: '×';
  padding-right: 0.2em;
}
.dog-editor label {
  display: block;
  padding-bottom: 0.7em;
}
.dog-editor label.invalid {
  color: red;
}
~~~

Here we define our own `Issue` class that we use to represent information about
the validation failure: the message text to display and the fields involved in
the problem. We don't bother making `fields` a List&mdash;it's just an array&mdash;since
in our application the related fields never change. The `check` function helps us
automate the creation of this structure in a succinct declaration.

Similarly, we create a helper for our editor view (which you could imagine using
across all the different views in your application) which, for some field, checks
whether any of the subject Model's `.errors` relates to that field, and applies
an `invalid` class if so.

Traits
======

One final note before we close here: much like you can bundle mutators together
with `template()`, and you can nest `template`s within `template`s, there is a
similar bundling mechanism for Models: `Trait`.

~~~
const { floor } = Math;
const BioDates = Trait(
  attribute('birth', attribute.Date),
  attribute('death', attribute.Date),
  bind('age_at_death', from('birth').and('death').all.map((b, d) =>
    floor((d.getTime() - b.getTime()) / 1000 / 3600 / 24 / 365))),
  validate(from('birth').and('death').all.map((b, d) => (d > b)
    ? types.validity.valid() : types.validity.error()))
);

const BioDetails = Trait(
  BioDates,
  attribute('name', attribute.Text)
);

const Person = Model.build(
  BioDetails,
  attribute('hometown', attribute.Text)
);

const ada = new Person({
  name: 'Ada',
  birth: new Date('1815-12-10'),
  death: new Date('1852-11-27'),
  hometown: 'London'
});

return inspect.panel(ada);
~~~

Recap
=====

Maps and Models are an important backbone in Janus. As one of the two fundamental
data structure types we provide, they serve a crucial purpose not just in directly
representing actual data, but also in gluing together the simple primitives you
have thus far encountered into meaningful conglomerations.

Maps are the pure data structure essence behind Models:

* They perform all the key/value storage (`.get_`, `.set`) and Varying key `.get`ting.
  * Keys may be nested into subobjects, but you should take care when directly
    `.get`ting or `.get_`ting a subobject instead of a data leaf.
* They support `.shadow` copying, allowing interrelated clones of your data.
  * This can be useful when trying to manage multiple versions of data, for
    instance when the user wants to edit something.
* They are enumerable and mappable.
  * `.enumerate` gets you the keys of a Map, which is useful when dealing with
    unknown schemas or solving problems where data must be listable (for instance
    to render) but also quick to lookup by some key.
  * The `.serialize` and `.diff` features supported by Map are enabled by Traversals,
    which you don't need to understand to leverage these features but which add
    great flexibility and power [if you do](/further-reading/traversal).
  * Maps can map (`.mapPairs`) to other Maps, with the same key structure. If
    you use `.flatMapPairs` instead, you can use a Varying to define that mapping.

Models extend Maps to provide behavioral definition on top of the pure data.

* Data `bind`ing of keys can help compute derived values that, for instance, the
  user interface or the server API requires.
  * They're also very useful when used on View Models.
  * But perhaps more importantly, they help sequence complex computations based
    off of ground truth, turning Models into potent problem-solving spaces.
* Named `attribute`s define a whole set of available behaviors for particular
  pieces on data in the Map:
  * They serve as class types that `render` can recognize for pulling up editor
    views for individual data attributes.
  * `.initial` values may be defined. You'll want to `.writeInitial` in some cases.
  * Custom (de)serialization can be defined per key (though again, the full Traversal
    offers far more granular control).
  * And some attribute types, like Enum, Model, and List, have some domain-specific
    behaviors in the form of additional properties and methods known to the framework
    and the standard library.
* Model validation is a very thin but therefore very flexible interface for defining
  validation rules.
  * `validate()` declarations are made during Model `build`ing just like `bind` and
    `attribute`, and their only requirement is that they must resolve to a `Varying[types.validity]`.

We've also begun to see, now that we have more powerful tools at our disposal,
what problem solving looks like in Janus.

* Complex interaction patterns become tractable when time and care is taken to
  boil the problem down to its minimal set of ground truth values.
  * Each piece of ground truth can usually be fed information simply and directly,
    with no cognitive overhead on object state or corner cases. This works best
    when each truth element is set directly an unconditionally from a single source.
  * Derived values based on that ground truth can then be bound in the same Model,
    and they will be recomputed only as necessary.
  * This essentially turns Model into a problem-solving space, one in which classical
    concerns like line ordering and object state become irrelevant.
  * You saw this when we created a modestly complicated dragging example. Ultimately,
    the entire interaction was driven off of four values.
* Many, many problems can be solved by thinking of the problem in terms of data
  and semantics. Janus is quite good at data transformations and bindings, so once
  you get the right data model in place there is often very little need for custom
  implementation code.
  * You saw this when we modelled a tabbed view as an Enum attribute based on the
    List of the views; picking one of many options is the same process as picking
    one of many tabs.
* The open-endedness in Janus is carefully structured to ground everybody in the
  same common language while leaving a lot of room for interpretation and creativity.
  * Model validation is a great example.
  * The case class encapsulates the most important fact (valid or not?) while
    carrying any arbitrary value most suited for your application.
  * You saw this when we created a rich representation of validation failures
    which could then drive an advanced user feedback experience.

Next Up
=======

We're not exactly done with Models and attributes yet; our [next chapter](/theory/requests-resolvers-references)
will dive into one particular type of attribute, Reference, which allows you to
reference data that should be fetched and inserted when needed.

Along with Request, which describes the remote data, and Resolvers, which actually
go and get the data, this subsystem equips Janus with a data-driven, Varying-based
solution to networking.

