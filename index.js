"use strict";

let ElementHomeClient = require('./lib/client');
let Accessory, Service, Characteristic, UUIDGen;

const numberMap = (value, x1, y1, x2, y2) =>
	((value - x1) * (y2 - x2)) / (y1 - x1) + x2;

module.exports = function(homebridge) {
	Accessory = homebridge.platformAccessory;
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	UUIDGen = homebridge.hap.uuid;

	homebridge.registerPlatform("homebridge-sengled", "SengledHub", SengledHubPlatform);
};

function SengledHubPlatform(log, config, api) {
	this.log = log;
	this.config = config;
	this.accessories = {};
	this.cache_timeout = 10; // seconds
	this.debug = config['debug'] || false;
	this.username = config['username'];
	this.password = config['password'];

	if (api) {
		this.api = api;
		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}

	this.client = new ElementHomeClient(log, this.debug);
}

SengledHubPlatform.prototype.configureAccessory = function(accessory) {
	let me = this;
	if (me.debug) me.log("configureAccessory invoked " + accessory);

	let accessoryId = accessory.context.id;
	if (this.debug) this.log("configureAccessory: " + accessoryId);

	// Handle rename case. Depending on which order the accessories come back in, we will want to handle them differently below
	if (this.accessories[accessoryId]) {
		this.log("Duplicate accessory detected, removing existing if possible, otherwise removing this accessory", accessoryId);
		try {
			this.removeAccessory(this.accessories[accessoryId], accessoryId);
			this.setService(accessory);
		} catch (error) {
			this.removeAccessory(accessory, accessoryId);
			accessory = this.accessories[accessoryId];
		}
	} else {
		this.setService(accessory);
	}

	this.accessories[accessoryId] = accessory;
};

SengledHubPlatform.prototype.didFinishLaunching = function() {
	let me = this;
	if (me.debug) me.log("didFinishLaunching invoked ");
	if (me.debug) me.log(me.accessories);

	// // dev-mode
	// for (let index in me.accessories) {
	// 	me.removeAccessory(me.accessories[index]);
	// }
	
	this.deviceDiscovery();
	setInterval(me.deviceDiscovery.bind(me), this.cache_timeout * 6000);
};

SengledHubPlatform.prototype.deviceDiscovery = function() {
	let me = this;
	if (me.debug) me.log("deviceDiscovery invoked");

	this.client.login(this.username, this.password).then(() => {
		return this.client.getDevices();
	}).then(devices => {
		if (me.debug) me.log("Adding discovered devices");
		for (let i in devices) {
			let existing = me.accessories[devices[i].id];

			if (!existing) {
				me.log("Adding device: ", devices[i].id, devices[i].name);
				me.addAccessory(devices[i]);
			} else {
				if (me.debug) me.log("Skipping existing device", i);
			}
		}

		// Check existing accessories exist in sengled devices
		if (devices) {
			for (let index in me.accessories) {
				var acc = me.accessories[index];
				me.getState(acc);
				var found = devices.find((device) => {
					return device.id.includes(index);
				});
				if (!found) {
					me.log("Previously configured accessory not found, removing", index);
					me.removeAccessory(me.accessories[index]);
				} else if (found.name != acc.context.name) {
					me.log("Accessory name does not match device name, got " + found.name + " expected " + acc.context.name);
					me.removeAccessory(me.accessories[index]);
					me.addAccessory(found);
					me.log("Accessory removed & readded!");
				}
			}
		}

		if (me.debug) me.log("Discovery complete");
		// if (me.debug) me.log(me.accessories);
	});
};

SengledHubPlatform.prototype.addAccessory = function(data) {
	let me = this;
	if (me.debug) me.log("addAccessory invoked: ");
	if (me.debug) me.log(data);

	if (!this.accessories[data.id]) {
		let uuid = UUIDGen.generate(data.id);
		// 5 == Accessory.Categories.LIGHTBULB
		// 8 == Accessory.Categories.SWITCH
		var newAccessory = new Accessory(data.id, uuid, 8);
		newAccessory.name = data.name
		
		newAccessory.context.name = data.name;
		newAccessory.context.id = data.id;
		newAccessory.context.cb = null;
		newAccessory.context.brightness = data.brightness
		// newAccessory.context.colorTemperature = data.colortemperature
		newAccessory.context.on = data.status

		var lightbulbService = new Service.Lightbulb();
		lightbulbService.displayName = data.name;

		var bringtnessCharacterstics = new Characteristic.Brightness(UUIDGen.generate(data.id + "1"));
		lightbulbService.addCharacteristic(bringtnessCharacterstics);		
		var colorTemperatureCharacterstics = new Characteristic.ColorTemperature(UUIDGen.generate(data.id + "1"));
		lightbulbService.addCharacteristic(colorTemperatureCharacterstics);
		newAccessory.addService(lightbulbService, data.name);

		this.setService(newAccessory);

		this.api.registerPlatformAccessories("homebridge-sengled", "SengledHub", [newAccessory]);
	} else {
		var newAccessory = this.accessories[data.id];
	}

	this.getInitState(newAccessory, data);

	this.accessories[data.id] = newAccessory;
};

/**
 * In some cases the accessory context is undefined, or the accessory is undefined. to keep the code dry, this
 * is the only method for removing an accessory from the homebridge platform and the plugin accessory context.
 *
 * When the id is already known, it should be passed as the second parameter to ensure both homebridge api and
 * local accessory context is cleaned up after a device rename/removal. There may be a case where the id needs
 * to be removed from local context, but is missing from the homebridge api, so I wrapped the
 * unregisterPlatformAccessories call in a try/catch to avoid crashing before removing from this.accessories
 *
 * If the accessoryId is not passed in, attempt to find the accessory id from the context. In the case where
 * the id is still not determined, attempt to remove the device from the homebridge api to avoid crashes.
 */
SengledHubPlatform.prototype.removeAccessory = function(accessory, accessoryId = undefined) {
	if (accessory) {
		let id = accessoryId !== undefined ? accessoryId : (accessory.context === undefined ? undefined : accessory.context.id);
		if (this.debug) this.log("Removing accessory", id);

		try {
			this.api.unregisterPlatformAccessories("homebridge-sengled", "SengledHub", [accessory]);
		} catch (error) {
			// in case its already been deregistered, don't crash. remove from plugin's accessories context below
		}

		// Remove from local accessories context if id is defined
		if (id !== undefined) {
			delete this.accessories[id];
		}
	}
};

SengledHubPlatform.prototype.setService = function(accessory) {
	let me = this;
	if (me.debug) me.log("setService invoked: ");
	if (me.debug) me.log(accessory);

	var lightbulbService = accessory.getService(Service.Lightbulb);
	lightbulbService.getCharacteristic(Characteristic.On)
		.on('set', this.setPowerState.bind(this, accessory.context))
		.on('get', this.getPowerState.bind(this, accessory.context));
	lightbulbService.getCharacteristic(Characteristic.Brightness)
		.on('set', this.setBrightness.bind(this, accessory.context))
		.on('get', this.getBrightness.bind(this, accessory.context));
	lightbulbService.getCharacteristic(Characteristic.ColorTemperature)
		.on('set', this.setColorTemperature.bind(this, accessory.context))
		.on('get', this.getColorTemperature.bind(this, accessory.context));

	accessory.on('identify', this.identify.bind(this, accessory.context));
};

SengledHubPlatform.prototype.getInitState = function(accessory, data) {
	let me = this;
	if (me.debug) me.log("getInitState invoked: " + accessory + " " + data);

	let info = accessory.getService(Service.AccessoryInformation);

	accessory.context.manufacturer = "Sengled";
	info.setCharacteristic(Characteristic.Manufacturer, accessory.context.manufacturer);

	accessory.context.model = (data.productCode != null) ? data.productCode : "Sengled Hub";
	info.setCharacteristic(Characteristic.Model, accessory.context.model);

	info.setCharacteristic(Characteristic.SerialNumber, accessory.context.id);

	me.getState(accessory);
};

SengledHubPlatform.prototype.getState = function(accessory) {
	let me = this;
	if (me.debug) me.log("getState invoked: " + accessory);

	accessory.getService(Service.Lightbulb)
		.getCharacteristic(Characteristic.On)
		.getValue();
	accessory.getService(Service.Lightbulb)
		.getCharacteristic(Characteristic.Brightness)
		.getValue();
	accessory.getService(Service.Lightbulb)
		.getCharacteristic(Characteristic.ColorTemperature)
		.getValue();
};

SengledHubPlatform.prototype.setPowerState = function(thisPlug, powerState, callback) {
	let me = this;
	if (this.debug) this.log("++++ Sending device: " + thisPlug.id + " status change to " + powerState);

	return this.client.login(this.username, this.password).then(() => {
		return this.client.deviceSetOnOff(thisPlug.id, powerState);
	}).then(() => {
		// thisPlug.status = device.status;
		// callback(null, device.status);
		callback();
	}).catch((err) => {
		this.log("Failed to set power state to", powerState);
		callback(err);
	});
};

SengledHubPlatform.prototype.getPowerState = function(thisPlug, callback) {
	let me = this;
	if (this.debug) this.log("Getting device: " + thisPlug.name + " status");
	if (this.accessories[thisPlug.id]) {
		return this.client.login(this.username, this.password).then(() => {
			return this.client.getDevices();
		}).then(devices => {
			return devices.find((device) => {
				return device.id.includes(thisPlug.id);
			});
		}).then((device) => {
			if (typeof device === 'undefined') {
				if (this.debug) this.log("Removing undefined device", thisPlug.name);
				this.removeAccessory(thisPlug)
			} else {
				if (this.debug) this.log("getPowerState complete: " + device.name + " " + thisPlug.name + " is " + device.status);
				thisPlug.status = device.status;
				callback(null, device.status);
			}
		});
	} else {
		callback(new Error("Device not found"));
	}
};

SengledHubPlatform.prototype.setBrightness = function(thisPlug, brightness, callback) {
	let me = this;
	if (me.debug) me.log("++++ setBrightness: " + thisPlug.name + " status brightness to " + brightness);
	brightness = brightness || 0;
	brightness = Math.round(numberMap(brightness, 0, 100, 0, 255));
	if (me.debug) me.log("++++ Sending device: " + thisPlug.name + " status brightness to " + brightness);

	return this.client.login(this.username, this.password).then(() => {
		return this.client.deviceSetBrightness(thisPlug.id, brightness);
	}).then(() => {
		// thisPlug.brightness = brightness;
		// callback(null, device.brightness);
		callback();
	}).catch((err) => {
		this.log("Failed to set brightness to", brightness);
		callback(err);
	});
};

SengledHubPlatform.prototype.getBrightness = function(thisPlug, callback) {
	let me = this;
	if (this.debug) this.log("Getting device: " + thisPlug.id + " status");
	if (this.accessories[thisPlug.id]) {
		return this.client.login(this.username, this.password).then(() => {
			return this.client.getDevices();
		}).then(devices => {
			return devices.find((device) => {
				return device.id.includes(thisPlug.id);
			});
		}).then((device) => {
			this.log("+++ device");
			this.log(device);
			if (typeof device === 'undefined') {
				if (this.debug) this.log("Removing undefined device", thisPlug.name);
				this.removeAccessory(thisPlug)
			} else {
				var brightness = Math.round(numberMap(device.brightness, 0, 255, 0, 100));
				if (this.debug) this.log("getBrightnessState complete: " + device.name + " " + thisPlug.name + " is " + device.brightness + " " + brightness);
				thisPlug.brightness = brightness;
				callback(null, brightness);
			}
		});
	} else {
		callback(new Error("Device not found"));
	}
};

SengledHubPlatform.prototype.setColorTemperature = function(thisPlug, colortemperature, callback) {
	let me = this;
	if (me.debug) me.log("++++ setColortemperature: " + thisPlug.name + " status colortemperature to " + colortemperature);
	colortemperature = colortemperature || 0;
	colortemperature = Math.min(Math.round(numberMap(colortemperature, 140, 400, 0, 255)),255);
	if (me.debug) me.log("++++ Sending device: " + thisPlug.name + " status colortemperature to " + colortemperature);

	return this.client.login(this.username, this.password).then(() => {
		return this.client.deviceSetColorTemperature(thisPlug.id, colortemperature);
	}).then(() => {
		callback();
	}).catch((err) => {
		this.log("Failed to set brightness to", colortemperature);
		callback(err);
	});
};

SengledHubPlatform.prototype.getColorTemperature = function(thisPlug, callback) {
	let me = this;
	if (this.debug) this.log("Getting device: " + thisPlug.id + " colortemperature");
	if (this.accessories[thisPlug.id]) {
		return this.client.login(this.username, this.password).then(() => {
			return this.client.getDevices();
		}).then(devices => {
			return devices.find((device) => {
				return device.id.includes(thisPlug.id);
			});
		}).then((device) => {
			if (typeof device === 'undefined') {
				if (me.debug) me.log("Removing undefined device", thisPlug.name);
				this.removeAccessory(thisPlug)
			} else {
				var colortemperature = Math.round(numberMap(device.colortemperature, 0, 255, 140, 400));
				if (me.debug) me.log("getColortemperature complete: " + device.name + " " + thisPlug.name + " is " + device.colortemperature + " " + colortemperature);
				thisPlug.colorTemperature = colortemperature;
				callback(null, colortemperature);
			}
		});
	} else {
		callback(new Error("Device not found"));
	}
};

SengledHubPlatform.prototype.identify = function(thisPlug, paired, callback) {
	let me = this;
	if (me.debug) me.log("identify invoked: " + thisPlug + " " + paired);
	callback();
}
