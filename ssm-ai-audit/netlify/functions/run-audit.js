const generateAudit = require("./generate-audit");

exports.handler = async (event, context) => {
  return generateAudit.handler(event, context);
};
