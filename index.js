const app = require('choo')()

app.model(require('./models/popstate'))
app.model(require('./models/form'))

const read = require('./views/read')
const redirectToForm = require('./views/redirect-to-form')

app.router('/notFound', (route) => [
  route('/', read),
  route('/notFound', require('./views/not-found')),
  route('/forms', [
    route('/:digest', read)
  ]),
  route('/publications', [
    route('/:publisher', [
      route('/:project', redirectToForm, [
        route('/:edition', redirectToForm)
      ])
    ])
  ])
])

if (module.parent) module.exports = app
else document.body.appendChild(app.start())
