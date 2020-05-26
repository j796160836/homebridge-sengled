# homebridge-sengled (Beta)
An unoffical [Homebridge](https://github.com/nfarina/homebridge) platform plugin for Sengled accessories.

## Features for lamps:

- State (on / off)
- Hue (numeric value)
- Brightness (numeric value)

Note that I only have **Element Classic A19 Kit (Light bulbs + Hub)** to test.
https://us.sengled.com/products/element-classic-kit  

This plugin uses the existing Sengled Element Home app infrastructure to allow you to control your Sengled accessories.

Provide your username and password and register as a platform, and it will auto-detect the light bulb you have registered.

This plugin is still in beta.  
If you encounter anything out of this product. Issue and Pull Request is welcome 🙂.

# Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-sengled`
3. Update your configuration file. See below for a sample.

# Configuration

Configuration sample:

```
"platforms": [
  {
    "platform": "SengledHub",
    "name": "SengledHub",
    "username": "***",
    "password": "***"
  }
]
```

## Optional parameters

- debug, this will enable more logging information from the plugin, default = false
- info, this will enable logging on api access from the plugin, default = true
- cacheDuration, this will set the duration of the api call cache in seconds, default = 15 seconds

```
"platforms": [
  {
    "platform": "SengledHub",
    "name": "SengledHub",
    "username": "***",
    "password": "***",
    "debug": true,
    "info": true,
    "cacheDuration": 20000
  }
]
```

## Credits

- Inspired by [homebridge-vesync](https://github.com/AlakhaiVaynard/homebridge-vesync) project
