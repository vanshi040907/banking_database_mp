// forwards errors from async routes to the error handler instead of crashing the server
export const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);