const axios = require('axios');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
axiosCookieJarSupport(axios);
const cookieJar = new tough.CookieJar();

let moment = require('moment');
const https = require('https');

function _ArrayFlatMap(array, selector) {
    if (array.length == 0) {
        return [];
    } else if (array.length == 1) {
        return selector(array[0]);
    }
    return array.reduce((prev, next) =>
        /*first*/ (selector(prev) || /*all after first*/ prev).concat(
            selector(next)
        )
    );
}

function _guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return (
        s4() +
        s4() +
        '-' +
        s4() +
        '-' +
        s4() +
        '-' +
        s4() +
        '-' +
        s4() +
        s4() +
        s4()
    );
}

module.exports = class ElementHomeClient {
    constructor(log) {
        this.client = axios.create({
            baseURL: 'https://us-elements.cloud.sengled.com/zigbee/',
            timeout: 2000,
            jar: cookieJar,
            withCredentials: true,
            responseType: 'json'
        });
        this.client.defaults.headers.post['Content-Type'] = 'application/json';
        this.log = log;
        this.lastLogin = moment('2000-01-01');
        this.uuid = _guid();
    }

    login(username, password) {
        // If token has been set in last 24 hours, don't log in again
        // if (this.lastLogin.isAfter(moment().subtract(24, 'hours'))) {
        //     return Promise.resolve();
        // }

        return new Promise((fulfill, reject) => {
            if (this.jsessionid != null) {
                this.log('Cookie found, skipping login request.');
                fulfill(this.loginResponse);
            }
            this.client
                .post('/customer/remoteLogin.json', {
                    uuid: this.uuid,
                    isRemote: true,
                    user: username,
                    pwd: password,
                    os_type: 'ios'
                })
                .then(response => {
                    this.jsessionid = response.data.jsessionid;
                    this.lastLogin = moment();
                    this.loginResponse = response;
                    fulfill(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }

    getDevices() {
        // Example device response:
        // {
        //     "deviceUuid": "xxxxxxxxxxxxxxxx",
        //     "deviceName": "Bulb 1",
        //     "signalQuality": 1,
        //     "activeTime": "2018-02-08 21:43:27",
        //     "roomId": null,
        //     "roomName": null,
        //     "deviceVersion": "9",
        //     "isOnline": 0,
        //     "onoff": 0,
        //     "productCode": "E11-G14"
        // }
        // Map to device Object
        // {
        //     "id": "xxxxxxxxxxxxxxxx",
        //     "name": "Bulb 1",
        //     "isOnline": false,
        //     "status": false,
        //     "productCode": "E11-G14"
        // }

        // return new Promise((fulfill, reject) => {
        //   this.client.post('/device/getDeviceInfos.json', {})
        //   .then((response) => {
        //     if (response.data.ret == 100) {
        //       reject(response.data);
        //     } else {
        //       let gatewayList = response.data.gatewayList
        //       let deviceList = _ArrayFlatMap(gatewayList, i => i.deviceList);
        //       let devices = deviceList.map((device) => {
        //         return {
        //           id: device.deviceUuid,
        //           name: device.deviceName,
        //           status: device.onoff,
        //           isOnline: device.isOnline,
        //           signalQuality: device.signalQuality,
        //           productCode: device.productCode
        //         };
        //       });
        //       fulfill(devices);
        //     }
        //   }).catch(function (error) {
        //     reject(error);
        //   });
        // });
        return new Promise((fulfill, reject) => {
            this.client
                .post('/room/getUserRoomsDetail.json', {})
                .then(response => {
                    if (response.data.ret == 100) {
                        reject(response.data);
                    } else {
                        const { roomList } = response.data;
                        let deviceList = _ArrayFlatMap(
                            roomList,
                            i => i.deviceList
                        );
                        let devices = deviceList.map(device => {
                            return {
                                id: device.deviceUuid,
                                name: device.deviceName,
                                status: device.onoff,
                                brightness: device.brightness,
                                colorTemperature: device.colortemperature,
                                isOnline: device.isOnline,
                                signalQuality: device.signalQuality,
                                productCode: device.productCode,
                                rgb: [
                                    device.rgbColorR,
                                    device.rgbColorG,
                                    device.rgbColorB
                                ]
                            };
                        });
                        // this.log(devices);
                        fulfill(devices);
                    }
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }

    userInfo() {
        return new Promise((fulfill, reject) => {
            this.client
                .post('/customer/getUserInfo.json', {})
                .then(response => {
                    if (response.data.ret == 100) {
                        reject(response.data);
                    } else {
                        fulfill(response);
                    }
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }

    deviceSetOnOff(deviceId, onoff) {
        this.log('onOff ' + deviceId + ' ' + onoff);
        return new Promise((fulfill, reject) => {
            this.client
                .post('/device/deviceSetOnOff.json', {
                    onoff: onoff ? 1 : 0,
                    deviceUuid: deviceId
                })
                .then(response => {
                    if (response.data.ret == 100) {
                        reject(response.data);
                    } else {
                        fulfill(response);
                    }
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }

    // brightness: 0 - 255
    deviceSetBrightness(deviceId, brightness) {
        return new Promise((fulfill, reject) => {
            this.client
                .post('/device/deviceSetBrightness.json', {
                    brightness,
                    deviceUuid: deviceId
                })
                .then(response => {
                    if (response.data.ret == 100) {
                        reject(response.data);
                    } else {
                        fulfill(response);
                    }
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }

    // colorTemperature: 0 - 100
    deviceSetColorTemperature(deviceId, colorTemperature) {
        return new Promise((fulfill, reject) => {
            this.client
                .post('/device/deviceSetColorTemperature.json', {
                    colorTemperature,
                    deviceUuid: deviceId
                })
                .then(response => {
                    if (response.data.ret == 100) {
                        reject(response.data);
                    } else {
                        fulfill(response);
                    }
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
};
