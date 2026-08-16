let broker = null;

function setBroker(b) {
  broker = b;
}

function getBroker() {
  return broker;
}

module.exports = { setBroker, getBroker };
