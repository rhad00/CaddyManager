/**
 * Express gives a query parameter as a string, but also as an array (?a=1&a=2) or an
 * object (?a[b]=1). Routes that need text take the first plain string and ignore the rest.
 * @param {unknown} value - an entry of req.query
 * @returns {string|undefined}
 */
const queryString = (value) => {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : undefined;
};

module.exports = { queryString };
