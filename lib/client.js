const axios = require('axios');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();

let moment = require('moment');
const https = require('https');

Array.prototype.flatMap = function(selector){
  if (this.length == 0) {
    return [];
  } else if (this.length == 1) {
    return selector(this[0]);
  }
  return this.reduce((prev, next) =>
  (/*first*/ selector(prev) || /*all after first*/ prev).concat(selector(next)))
};

module.exports = class ElementHomeClient {

  constructor(log) {

    this.client = axios.create({
      baseURL: 'https://us-elements.cloud.sengled.com:443/zigbee/',
      timeout: 2000,
      jar: cookieJar,
      withCredentials: true,
      responseType: 'json'
    });
    this.client.defaults.headers.post['Content-Type'] = 'application/json';
    this.log = log
    this.lastLogin = moment('2000-01-01')
  }

  login(username, password) {
    // If token has been set in last 24 hours, don't log in again
    // if (this.lastLogin.isAfter(moment().subtract(24, 'hours'))) {
    //     return Promise.resolve();
    // }
    function guid() {
      function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
          .toString(16)
          .substring(1);
      }
      return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
    }

    return new Promise((fulfill, reject) => {
      this.client.post('/customer/remoteLogin.json',
      {
        'uuid':guid(),
        'isRemote':true,
        'user': username,
        'pwd': password,
        'os_type': 'ios'
      }).then((response) => {
        this.jsessionid = response.data.jsessionid;
        this.lastLogin = moment();
        fulfill(response);
      }).catch(function (error) {
        reject(error);
      });

    });


  }

  getDevices() {
    return new Promise((fulfill, reject) => {
      this.client.post('/device/getDeviceInfos.json', {})
      .then((response) => {
        if (response.data.ret == 100) {
          reject(response.data);
        } else {
          let gatewayList = response.data.gatewayList
          let deviceList = gatewayList.flatMap(i => i.deviceList);
          let devices = deviceList.map((device) => {
            return {
              id: device.deviceUuid,
              name: device.deviceName,
              status: device.onoff
            };
          });
          fulfill(devices);
        }
      }).catch(function (error) {
        reject(error);
      });
    });
  }

  userInfo() {
    return new Promise((fulfill, reject) => {
      this.client.post('/customer/getUserInfo.json', {})
      .then((response) => {
        if (response.data.ret == 100) {
          reject(response.data);
        } else {
          fulfill(response);
        }
      }).catch(function (error) {
        reject(error);
      });
    });
  }

  deviceSetOnOff(deviceId, onoff) {
    return new Promise((fulfill, reject) => {
      this.client.post('/device/deviceSetOnOff.json', {"onoff": onoff,"deviceUuid": deviceId})
      .then((response) => {
        if (response.data.ret == 100) {
          reject(response.data);
        } else {
          fulfill(response);
        }
      }).catch(function (error) {
        reject(error);
      });
    });
  }

  turnOn(deviceId, onoff) {
    return this.deviceSetOnOff(deviceId, 1);
  }

  turnOff(deviceId) {
    return this.deviceSetOnOff(deviceId, 0);
  }

};
