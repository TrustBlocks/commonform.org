var assert = require('assert')
var html = require('bel')

module.exports = function (heading) {
  assert(typeof heading === 'string')
  return html`
    <a  class=reference
        title="Jump to ${heading}"
        href="#Heading:${heading}"
        >${heading}</a>`
}
