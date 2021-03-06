App, and Applications
=====================

Janus is a heavily decentralized framework, a collection of independent primitives.
There is no global authority overseeing operations or coördinating actions across
different components. This has the benefit that its behaviors and defaults are
easy to override even case-by-case, as we have attempted to demonstrate repeatedly.

But this approach also has some intrinsic drawbacks that we must work to overcome.
It is difficult to inject global context across different components in your application
without a lot of manual, explicit `require` statements and cross-referencing&mdash;and
with that sort of explicitness it is difficult to define, when you need to, separate
behavior in different contexts, especially across the server-client divide. There
is also no natural candidate in those cases when you _do_ need a management
authority: for instance, when overseeing the lifecycle of a server-side page render
request or setting localization and language.

These areas are where `App`, `Library`, and `Manifest` come in: App and Library
work together to solve the context and glue problem, while Manifest provides a
potent (but as usual, entirely optional) interface for managing request lifecycles.

App
===

For starters, App is a Model. It `extend`s Model, implementing two [standard attributes](/theory/map-and-model)
which you should by now be familiar with: `views` and `resolvers`, both of which
are Libraries. It also implements three methods, two of which correspond directly
to these attributes&mdash;`.view(subject)`, as you have seen, returns a View for
the given subject, while `.resolve(request)`, which you have not seen as much of,
causes resolution on a Request. The third method is `.resolver()`, which as you
can probably guess relates somehow to `.resolve()`.

First, we'll talk about `.view`.

App View Management
-------------------

You may have noticed that in many of our simpler samples we skip using App entirely
and directly instantiate Views by `new ThingView(subjectModel)`. Any time we used
`app.view(subject)` to instantiate a View, it was because the View needed to `.render`
subviews.

It should make some amount of sense that App is involved with subview rendering,
since we always use `app.views.register(SubjectType, ViewType)` to indicate which
Views render which subjects in these examples. But we have avoided so far explaining
how exactly `.render` and App relate to each other, or how subviews gain the same
App context.

All Views take an `options` hash as their second argument; this is primarily for
your use as you see fit, but one framework-canonical property is `app`, which as
you might guess expects a reference to some App. The `.render` mutator takes advantage
of this reference: it formulates its own `from` chain which gets `point`ed alongside
your own&mdash;it wants `from.app()`, which when pointed by the View gets a reference
to its `options.app` if it has one.

Once `.render` has an App, it itself uses the same interface you would to actually
generate the View instance: `app.view(subject)`. You may also recall that `.render`
can be chained, with `.criteria` and `.options`. It turns out that `app.view` takes
three arguments: `(subject, criteria, options)`. All `.render` does is pass these
inputs right along to `app.view()`, which then performs a number of steps:

1. It attempts to get a View for your subject from its `.view` Library. It passes
   along the `criteria` you specify&mdash; more on this when we discuss Library,
   below. If the Library fails to find a matching View resource, `app.view` bails
   out with no return value.
2. Otherwise, now that it has a View classtype, it instantiates an instance of it,
   passing the subject as the first argument and the `options` you hand it as the
   second. Here's one of its tricks, though: it injects itself as `options.app`
   as it does so. This is how subviews get access to App context.
3. It then injects resolution context into the View subject, which we will cover
   later.

So in some sense, the machine is simple: you provide, either directly to `app.view`
or via `.render`, a subject, some optional Library search criteria, and an optional
options hash to instantiate the View with. But App performs two tricks: it sneaks
_itself_ in as `options.app`, and it does some resolution magic to make References
work (again, we'll cover this in a moment).

> As with everything in Janus, though, you can disable this magic. If you provide
> your _own_ value for `options.app`, that value is respected and used. This will
> most likely make your application context much more difficult to reason about,
> but we are allergic to magic and especially to magic you can't override.

So together, App and the `.views` Library it carries alleviate the need to manually
reference every rendered subview (and to solve the related circular dependency
and tight coupling problems), and App auto-injects itself into each new View in
the tree so that this context is available everywhere, without the need of some
central overseer.

In addition, though we did not demonstrate it here, this layer of indirection by
way of the Library allows easy behavior swappability between different contexts:
just register a different set of Views for the same subjects when you create your
App.

> In this documentation application, for example, we render the sample code snippets
> in plaintext rather than spin up an entire CodeMirror instance which, in addition
> to being expensive and useless in the server environment, does not play well
> with [domino](https://github.com/fgnass/domino), which is the DOM simulator we
> use for generating this site.

You can similarly register a different set of Resolvers against the same Requests&mdash;so
 let's take a look at Resolvers and resolution, and make sure we have a firm grasp
 of how _that_ system works.

App Resolver Handling
---------------------

In our previous chapter, we played directly with Requests and Resolvers before
moving on to implicit Request resolution through Reference attributes. We skipped
a few things in this description, but much like the `.render` mutator was a good
lens through which to examine the role of App and `app.view()`, Reference attribute
resolution is a good way for us to discuss how App and `app.resolve()` factor in
to Request resolution.

We will outline the specifics, then talk through them in detail:

1. As mentioned above, the last thing `app.view(subject)` does is inject its own
   context into the subject model.
   * This is done by calling `.attributes()` on the subject to get all its defined
     attributes. If the subject does not support this method, nothing happens.
   * Then, for each attribute that has a `#resolveWith` method, that method will
     be called with the `app` as the context argument. Typically, these will be
     `Reference` type attributes.
     * This behaviour can be disabled on a per-attribute basis by setting the
       `.autoResolve` property to `false` on the attribute.
     * If you do disable this automatic context injection with `.autoResolve = false`,
       you can _then_ force it back on, on a view by view basis, by setting the
       [`resolve` View option](/theory/requests-resolvers-references#the-reference-attribute).
2. As you'll [recall from the previous chapter](/theory/requests-resolvers-references#reference-internals),
   `.resolveWith` merely provides an `app` context by which resolution can occur
   if needed.
3. When the Reference attribute decides that resolution must occur, it calls
   `app.resolve(request)` to obtain a `Varying[types.result[x]]`. This is why it
   needs a reference to App.
4. App, in turn, passes the Request to its Resolver, and returns the result.
   * App gets its Resolver from its own `.resolver()` method, which you can (and
     probably should) override.
   * `.resolver()` is only ever called once; its return value is cached and used
     from that point forward.
   * The default implementation of `.resolver()` simply uses `Resolver.fromLibrary(app.resolvers)`.
     It is common to override this to insert higher-order Resolvers like caches,
     as detailed in the previous chapter.

It's worth explaining auto-resolution a second time. First, all `.resolveWith`
does is provide an App context for the Reference attribute to use _if it so chooses_.
It does _not_ immediately cause Request resolution. But because `.resolveWith`
will only ever take one App context, you may wish to maintain fine control over
when it is called.

It is rare that this automatic App propagation is undesirable. But it _is_ important
to offer an escape route given its virulence&mdash;App will always perform the above
procedure unless otherwise instructed: search the subject for all attributes with
a `#resolveWith` method and call it with a reference to itself.

If you flag Reference attributes with `.autoResolve = false`, those attributes
will be skipped in this process. You can still have App plumb `.resolveWith` for you
in particular cases.

Again, you will rarely need to do any of this. As we discussed in the previous
chapter, References try to be lazy: they will only run off and perform their request
if they sense that the data they could provide is actually needed. It is exceedingly
rare that you would reference a piece of data but then not want the data to be
retrieved for it. But we emphatically believe that all magical behaviour must
be easily disabled on a granular level, and so we provide all these options.

The `resolver()` method
-----------------------

It's also worth providing a concrete example of `.resolver()`; it should look
quite familiar from the previous chapter:

~~~ noexec
class MyApp extends App {
  resolver() {
    return Resolver.caching(
      new Resolver.MemoryCache(), Resolver.fromLibrary(resolvers));
  }
}
~~~

Because `.resolver()` is only called once and the result is cached as The Resolver
unconditionally used for all needed Request resolution, you need to get all of
your Resolver layering done up-front. But a benefit of this is that expressions
like `new Resolver.MemoryCache()` work without extra homework: there is no need
to, for example, instantiate a `MemoryCache` once and save it on the class to be
used each time the cache is checked.

> There is an [open issue](https://github.com/issa-tseng/janus/issues/130) focused
> on making this mechanism smoother and more confluent with the rest of App.

The App Process
---------------

As a whole, this Request resolution process is strikingly similar to the View
handling procedure we just covered.  First, there is some optional procedure by
which App context is injected into a dependent component: `options.app` in the
case of View, and `.resolveWith` in the case of Model Reference attributes.

In either case, the controlling element is a local authority (the `.render`
mutator managing its own spot in the DOM tree based on some piece of data; the
Reference attribute managing its own spot in its Model store based on some
notion of need), and these controlling elements sit on the App context until a
contextual action must occur (subview rendering, or Request resolution).

And when that contextual action needs to occur, the appropriate App method is
called (`app.view`, `app.resolve`), an App configuration is consulted (the
`app.views` Library, or the `app.resolver` method, which by default checks the
`app.resolvers` Library).

In general, we do our best to sequester all our gluey magic within App. Allowing
App to autoinject itself into View children and Reference attributes is the closest
we come to magic in Janus. But we have taken pains to ensure that this behavior
is customizable or ignorable in individual cases or in general. We've also managed
to keep the footprint fairly small&mdash;App is only around 50 lines of code.

App Events
----------

App provides one more useful facility, for both View and Request handling. For
each View instantiated via `app.view()`, the App will emit a `createdView` event
with the instantiated `view` as the event argument. For each Request resolved, the
App will emit `resolvedRequest` with `request, result` as the event arguments,
where `result` is the `Varying[types.result[x]]` returned by the Resolver.

This can be extremely useful for tasks like loading bars and other higher-level
concerns in your application. Here, for instance, is a simplified version of the
loading indicator on this documentation site:

~~~
// A mock request that just takes 5 seconds to finish:
class MockRequest {}
const mockRequestResolver = (request) => {
  const result = new Varying(types.result.pending());
  setTimeout((() => result.set(types.result.success())), 5000);
  return result;
};

// Loading indicator:
class AppViewModel extends Model.build(
  initial.writing('pending-requests', new List())
) {
  _initialize() {
    const app = this.get_('subject');
    const pending = this.get_('pending-requests');
    app.on('resolvedRequest', (_, result) => { pending.add(result); });
  }
}

// Application view:
const AppView = DomView.build(AppViewModel, $(`
  <div>
    <div id="demo-main">Content! <button>Load more.</button></div>
    <div id="demo-loader">LOADING</div>
  </div>`), template(

  find('#demo-loader').classed('loading', from.vm('pending-requests').flatMap(pr =>
    pr.filter(req => req.map(types.result.pending.match)).nonEmpty())),

  find('button').on('click', (event, subject) => {
    subject.resolve(new MockRequest()); })
));

// Application glue:
const app = new App();
app.resolvers.register(MockRequest, mockRequestResolver);
app.views.register(App, AppView);

return app.view(app);
~~~
~~~ styles
#demo-loader { display: none; }
#demo-loader.loading { display: block; }
~~~

Every time our App resolves a Request (each time you mash on the "more" button),
we keep track of it. If any Request is still pending, we show a spinner. You could
also take a different approach in the `resolvedRequest` event handler, reacting
to the request when it's added to the list and removing it when the Request is
complete. This would obviate the `.filter` in the View and reduce memory leakage,
but also result in a longer, noisier code sample.

Through these events, App is our gateway into contextual actions happening all
over our application. This loading indicator is one example; another is Manifest,
which we will cover at the end of this chapter.

The Library
===========

You've already seen a lot of the Library in use. Here, we'll just formalize what
you already know and add some minor details and additional options.

You already know that you can `.register` View classes to subject classes and
Resolver functions to Request classes. A Library can `.register(target, resource)`
any resource of any type to any target classtype. Again: `target` must be a
class, but `resource` may be anything at all. When you `.get(instance)` of the
`target` type, you will get `resource` back.

Library has some cleverness to it: if it fails to find a match for the class of
the instance, it will look up the inheritance hierarchy to see if anything there
matches:

~~~
class A {}
class B extends A {}
class C extends B {}

const library = new Library();
library.register(A, 42);

return [
  library.get(new A()),
  library.get(new B()),
  library.get(new C())
];
~~~

Notice how the Library just returns the registered resource as-is. When you register
View classes against subjects, the Library itself just returns the View classtype
that you registered. It's `app.view()` that does the work of actually instantiating
the View (remember, this is how app injects itself into Views that it creates).

You may recall that the `.render` mutator had `.context` and `.criteria` chaining
options which we did not get into. `criteria` are key/value descriptions of your
resource which you may optionally match against when `.get`ting from the Library
to narrow your search by some specific requirement.

~~~
class A {}

const library = new Library();
library.register(A, 42, { parity: 'even', answer: true });
library.register(A, 13, { parity: 'odd' });

return [
  library.get(new A()),
  library.get(new A(), { parity: 'odd' }),
  library.get(new A(), { parity: 'even' }),
  library.get(new A(), { other: 'other' })
];
~~~

As you can see with the first sample, earlier registrations will take precedence
over later ones, all else being equal. From the `even` parity sample, you can see
that only criteria provided in the `.get` are checked.

`context` is a criteria attribute like any other, except that `context: 'default'`
is special. When a `default` context is provided, that registration will be used
as a fallback if a registration with the requested context cannot be found:

~~~
class A {}
const library = new Library();
library.register(A, 8, { context: 'small' });
library.register(A, 305, { context: 'huge', parity: 'odd' });
library.register(A, 42, { context: 'default' });

return [
  library.get(new A()),
  library.get(new A(), { context: 'huge' }),
  library.get(new A(), { context: 'positively ginormous' }),
  library.get(new A(), { parity: 'odd' })
];
~~~

> The `.context(string)` method on the `.render` chain is a convenient shortcut
> for specifying `.criteria({ context: string })`.

Finally, let's put the Library work back in context of `app.view`:

~~~
const caseContents = from.self().map(view => view.subject.get());

const SuccessTextView = DomView.build($('<div>Success!</div>'), template());
const SuccessContentView = DomView.build($('<div/>'),
  find('div').render(caseContents));
const SuccessHybridView = DomView.build(
  $('<div>Success: <div class="content"/></div>'),
  find('.content').render(caseContents));

const SampleView = DomView.build($('<div/>'),
  find('div').render(from('value'))
    .criteria(from('criteria'))
    .context(from('context')));

const app = new App();
app.views.register(Map, SampleView);
app.views.register(types.result.success, SuccessTextView,
  { context: 'default', label: true });
app.views.register(types.result.success, SuccessContentView,
  { context: 'full', label: false });
app.views.register(types.result.success, SuccessHybridView,
  { context: 'full', label: true });
stdlib.view($).registerWith(app.views);

return [
  app.view(new Map({ value: types.result.success(4) })),
  app.view(new Map({ value: types.result.success(8), context: 'full' })),
  app.view(new Map({ value: types.result.success(15),
    criteria: { context: 'full', label: true } })),
  app.view(new Map({ value: types.result.failure(16) }))
];
~~~

As you can see, Library can match against case class types. It can also match
against `String`, `Boolean`, and many other Javascript primitives: this is how
plain numbers and text have been appearing in the sample results displays this
whole time.

Manifest
========

The very last new component we will cover in this theoretical overview of Janus,
the Manifest combines a lot of concepts you've already learned to form a useful
but optional machine and protocol for managing render lifecycles.

On the client, this isn't so nearly important a concept: your interface assembles
itself on demand, as data arrives, and your application state is whatever it is.
But on the server, it becomes more important to understand this state: is everything
done fetching and rendering? Did anything crucial to the essence of the page fail
to fetch completely, necessitating an error page result?

Manifest answers these questions:

* Manifest assumes your application page has some root Model (usually a ViewModel)
  whose app-registered View is the artifact you wish to return to the user.
* It attaches itself to the `app` used to render your page, keeping track of Requests
  being resolved. Each time all known Requests are complete, it waits one tick
  to be sure that there are no follow-up Requests to be made. When it is satisfied
  that your application is done with Requests, it flags a completion via a
  `Varying[types.result[x]]` property that it exposes.
* In order to understand what sort of completion to flag, Manifest looks at validations
  on the page Model. If any fail, the overall result is a `failure`. Otherwise,
  `success`.

Let's see an example of these facilities in action.

~~~
const ifExists = (f) => (x) => (x == null) ? null : f(x);
const existsOrError = (err => x => (x != null)
  ? types.validity.valid()
  : types.validity.error(err));

const User = Model.build();

const ProfilePage = Model.build(
  attribute('user', attribute.Reference.to(
    from('cookie').map(cookie => new UserRequest({ cookie })))),

  attribute('friends', attribute.Reference.to(
    from('user').get('id').map(uid => new FriendsRequest(uid)))),

  validate(from('user').map(existsOrError('Could not find user by session.'))),
  validate(from('friends').map(existsOrError('Could not fetch friends list.'))));

class UserRequest extends Request {}
const userResolver = (request) => {
  const result = new Varying(types.result.pending());
  if (request.options.cookie != null)
    // fetch user information by cookie etc etc:
    setTimeout((() => result.set(types.result.success(new User({
      id: 42, displayName: 'Ford'
    })))), 2000);
  else
    // fetch user information by something else..
    null;
  return result;
};

class FriendsRequest { constructor(uid) { this.uid = uid; } }
const friendsResolver = (request) => {
  const result = new Varying(types.result.pending());
  // fetch friends list by user id etc etc:
  setTimeout((() => result.set(types.result.success(new List([
    new User({ id: 108, displayName: 'Arthur' }),
    new User({ id: 240, displayName: 'Trillian' }),
    new User({ id: 999, displayName: 'Zaphod' })
  ])))), 2000);
  return result;
};

const ProfilePageView = DomView.build($(`
  <div>
    <div class="user-display-name"/>
    <div class="user-friend-count"><span class="count"/> friends</div>
    <div class="user-friends"/>
  </div>`), template(
  find('.user-display-name').text(from('user').get('displayName')),
  find('.user-friend-count .count').text(from('friends').flatMap(ifExists(
    friends => friends.length))),
  find('.user-friends').render(from('friends').map(ifExists(
    friends => friends.flatMap(friend => friend.get('displayName')))))));

const app = new App();
app.views.register(ProfilePage, ProfilePageView);
stdlib.view($).registerWith(app.views);

app.resolvers.register(UserRequest, userResolver);
app.resolvers.register(FriendsRequest, friendsResolver);

const profilePage = new ProfilePage({ cookie: 'topsecret' });
const manifest = Manifest.run(app, profilePage);

return [
  inspect(manifest.result),
  manifest.requests.length
];
~~~

Try modifying the code above to cause various failure conditions: return a failure
for one of the requests, for example, or remove one of the Request-causing bindings
from the View template. If you prevent the second request from occurring, the Manifest
result will resolve sooner.

Manifest does this by listening to the `resolvedRequest` event on App described
above. Any Requests that are resolved are snooped on, and completions are counted.
At the moment that all Requests have completed and any changes have settled down,
the Model validity is assessed and the final result is flagged.

Manifest also records all Requests made in the course of rendering the page in
its `.requests` property. Each element in the `.requests` List is a `{ request, result }`
plain object. This can be handy for tasks like serializing page data alongside
the rendered markup for use by the client.

The goal behind Manifest is to serve as a thin, generic layer between your router
and your response formulation. Once you have instantiated the appropriate Model
for the page in question, it can be fed to Manifest and a common handling layer
can take over from there. You can check the [Practical Guide chapter](/hands-on/and-the-server-too)
on this topic for some examples of this plumbing in practice.

Recap
=====

App and Library serve as contextual backbones for your application. They are both
the repository for and executors of View rendering and Request resolution. In the
highly decentralized world that is Janus, App is the only component that glues
your application together at a higher level.

* `app.view(subject)` uses Library to determine a View class to render for your
  subject, passing along search criteria and instantiation options.
  * As it does so, it injects itself as the `app` resource for the new subview,
    thus becoming common context for your entire view tree.
  * It also injects itself into the View subject being rendered as Request resolution
    context for its Reference attributes. Those References won't actually attempt
    Request resolution unless their data is observed and thus required, but the
    automatic injection ensures that resolution can occur when it must.
  * Each view that is instantiated causes a `createdView` event on the App that
    you can leverage for various things.
* `app.resolve(request)` uses the internal `app.resolver()` method to resolve the
  given Request.
  * The default `.resolver()` also uses a Library, `app.resolvers`, to find a
    registered resolver for the Request.
  * But `.resolver()` may be overridden to, for instance, add caching layers.
  * Each Request that is resolved causes a `resolvedRequest` event on the App.

Manifest uses App's relative omniscience and Model validation to offer one method
of managing server-side request rendering lifecycles.

* Manifest takes an App, and a Model whose Library-registered View in that App is
  the desired artifact to return as the page response. It instantiates that View
  for you.
* Manifest uses App events to determine when Requests have been made, and therefore
  when they have been resolved.
  * It waits a tick after all resolutions to ensure cascading Requests are allowed
    to occur.
  * All requests made over the course of resolving the page are available on the
    Manifest under the `.requests` property, which is a `List[{ request: Request, result: Varying[types.result[x]] }]`.
* When all Requests have resolved, Manifest looks at the Model validation state
  to determine whether the render as a whole was succesful or not.
  * The final result is available under `.result`, which is a `Varying[types.result[x]]`.

Next Up
=======

With that, you have now inspected every component of Janus, from the core primitives
Varying, Case, and from, through the Views and templating system, the data structures
List, Map, and their bigger sister Model, and all the way up to App, Library, and
Manifest, which glue these disparate components together into larger working machines.

There is but one more core theory topic to cover: [resource management](/theory/resource-management).

