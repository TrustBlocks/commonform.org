var DOCX_CONTENT_TYPE = require('docx-content-type')
var docx = require('commonform-docx')
var escape = require('../util/escape')
var get = require('simple-get')
var internalError = require('./internal-error')
var notFound = require('./not-found')
var loadComponents = require('commonform-load-components')
var methodNotAllowed = require('./method-not-allowed')
var outlineNumbering = require('outline-numbering')
var reviewersEditionCompare = require('reviewers-edition-compare')
var reviewersEditionUpgrade = require('reviewers-edition-upgrade')
var runAuto = require('run-auto')
var sanitize = require('../util/sanitize')
var signaturePagesToOOXML = require('ooxml-signature-pages')

var footer = require('./partials/footer')
var form = require('./partials/form')
var html = require('./html')
var preamble = require('./partials/preamble')
var projectLink = require('./partials/project-link')
var publisherLink = require('./partials/publisher-link')

// TODO: Show release notes.

module.exports = function (configuration, request, response) {
  if (request.method !== 'GET') {
    return methodNotAllowed.apply(null, arguments)
  }
  var edition = sanitize(request.params.edition)
  if (edition === 'current' || edition === 'latest') {
    return redirect.apply(this, arguments)
  }
  var publisher = sanitize(request.params.publisher)
  var project = sanitize(request.params.project)
  runAuto({
    publication: function (done) {
      get.concat({
        url: (
          configuration.api +
          '/publishers/' + encodeURIComponent(publisher) +
          '/projects/' + encodeURIComponent(project) +
          '/publications/' + encodeURIComponent(edition)
        ),
        json: true
      }, function (error, response, data) {
        done(error, data)
      })
    },
    project: function (done) {
      get.concat({
        url: (
          configuration.api +
          '/publishers/' + encodeURIComponent(publisher) +
          '/projects/' + encodeURIComponent(project) +
          '/publications'
        ),
        json: true
      }, function (error, response, data) {
        done(error, data.sort(reviewersEditionCompare))
      })
    },
    form: ['publication', function (data, done) {
      get.concat({
        url: configuration.api + '/forms/' + data.publication.digest,
        json: true
      }, function (error, response, form) {
        done(error, form)
      })
    }],
    loaded: ['form', function (data, done) {
      var clone = JSON.parse(JSON.stringify(data.form))
      loadComponents(clone, {}, function (error, form, resolutions) {
        if (error) return done(error)
        done(null, {form, resolutions})
      })
    }]
  }, function (error, data) {
    if (error) {
      return internalError(configuration, request, response, error)
    }
    var publication = data.publication
    if (request.query.format === 'docx') {
      var options = {
        title: publication.project,
        edition: publication.edition,
        markFilled: true,
        numbering: outlineNumbering
      }
      if (publication.signaturePages) {
        options.after = signaturePagesToOOXML(publication.signaturePages)
      }
      response.setHeader('Content-Type', DOCX_CONTENT_TYPE)
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${publication.project} ${publication.edition}.docx"`
      )
      response.end(
        docx(data.loaded.form, [], options).generate({type: 'nodebuffer'})
      )
      return
    } else if (request.query.format === 'json') {
      response.setHeader('Content-Type', 'application/json')
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${publication.project} ${publication.edition}.json"`
      )
      var combined = Object.assign(
        {},
        data.publication,
        {form: data.form, loaded: data.loaded}
      )
      response.end(JSON.stringify(combined))
      return
    }
    response.setHeader('Content-Type', 'text/html; charset=UTF-8')
    var docxHREF = (
      '/' + encodeURIComponent(publisher) +
      '/' + encodeURIComponent(project) +
      '/' + encodeURIComponent(edition) +
      '?format=docx'
    )
    var jsonHREF = (
      '/' + encodeURIComponent(publisher) +
      '/' + encodeURIComponent(project) +
      '/' + encodeURIComponent(edition) +
      '?format=json'
    )
    response.end(html`
    ${preamble()}
<header>
  <a href=/>${escape(configuration.domain)}</a> /
  ${publisherLink(publisher)} /
  ${projectLink(data.publication)} /
  ${escape(edition)}
</header>
<main>
  <article>
    ${editionWarnings(edition, data.project)}
    <p>
      <a class=digest href=/forms/${data.publication.digest}>${data.publication.digest}</a>
    </p>
    <a href="${docxHREF}">Download .docx</a>
    <a href="${jsonHREF}">Download .json</a>
    <a href=/edit?from=${data.publication.digest}>Edit</a>
    ${form(data.form, data.loaded)}
  </article>
</main>
<script>window.publication = ${JSON.stringify(data.publication)}</script>
${footer()}
    `)

    function editionWarnings (displaying, available) {
      var upgrades = available.filter(function (available) {
        return reviewersEditionUpgrade(displaying, available)
      })
      if (upgrades.length !== 0) {
        var upgrade = upgrades[upgrades.length - 1]
        var href = (
          '/' + encodeURIComponent(publisher) +
          '/' + encodeURIComponent(project) +
          '/' + encodeURIComponent(upgrade)
        )
        return `<p class=warn>
          An
          <a href="${href}">upgraded edition</a>
          of
          ${publisherLink(publisher)} /
          ${projectLink(data.publication)}
          is available.
        </p>`
      }
    }
  })
}

function redirect (configuration, request, response) {
  var params = request.params
  var publisher = sanitize(params.publisher)
  var project = sanitize(params.project)
  var edition = sanitize(params.edition)
  get.concat({
    url: (
      configuration.api +
      '/publishers/' + encodeURIComponent(publisher) +
      '/projects/' + encodeURIComponent(project) +
      '/publications/' + edition
    )
  }, function (error, publicationResponse, data) {
    if (error) {
      return internalError(configuration, request, response, error)
    }
    var statusCode = publicationResponse.statusCode
    if (statusCode !== 200) {
      return notFound(configuration, request, response, [
        'No current publication found.',
        'The publisher may have published only drafts so far.'
      ])
    }
    var body = JSON.parse(data)
    response.statusCode = 303
    var uri = (
      '/' + encodeURIComponent(publisher) +
      '/' + encodeURIComponent(project) +
      '/' + encodeURIComponent(body.edition)
    )
    response.setHeader('Location', uri)
    response.end()
  })
}
