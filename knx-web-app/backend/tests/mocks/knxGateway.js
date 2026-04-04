class MockKnxGateway {
  constructor(io) {
    this.io = io;
    this.isConnected = false;
    this.deviceStates = {};
    this.gaToType = {};
    this.sceneTriggerCallback = null;
    this.connectCalls = [];
    this.readCalls = [];
    this.writeCalls = [];
    this.nextWriteError = null;
  }

  connect(ipAddress, port, onConnect) {
    this.connectCalls.push({ ipAddress, port });
    this.isConnected = true;
    if (typeof onConnect === 'function') {
      onConnect();
    }
  }

  setGaToType(map) {
    this.gaToType = map;
  }

  setSceneTriggerCallback(callback) {
    this.sceneTriggerCallback = callback;
  }

  readStatus(groupAddress) {
    this.readCalls.push(groupAddress);
  }

  failNextWrite(message) {
    this.nextWriteError = message;
  }

  writeGroupValue(groupAddress, value, dpt) {
    if (this.nextWriteError) {
      const error = new Error(this.nextWriteError);
      this.nextWriteError = null;
      throw error;
    }

    this.writeCalls.push({ kind: 'group', groupAddress, value, dpt });
    this.deviceStates[groupAddress] = value;
    this.io.emit('knx_state_update', { groupAddress, value });
  }

  writeScene(groupAddress, sceneNumber) {
    if (this.nextWriteError) {
      const error = new Error(this.nextWriteError);
      this.nextWriteError = null;
      throw error;
    }

    this.writeCalls.push({ kind: 'scene', groupAddress, sceneNumber, dpt: 'DPT17.001' });
  }

  emitSceneTrigger(groupAddress, sceneNumber) {
    if (this.sceneTriggerCallback) {
      return this.sceneTriggerCallback(groupAddress, sceneNumber);
    }
    return Promise.resolve();
  }
}

module.exports = MockKnxGateway;
