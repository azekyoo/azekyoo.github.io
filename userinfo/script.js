// Complete User Information Collection Script
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        collectAllInformation();
        document.getElementById('loading').style.display = 'none';
        document.getElementById('infoGrid').style.display = 'grid';
    }, 1000);
});

async function collectAllInformation() {
    // Screen & Display Information
    collectScreenInfo();
    
    // Browser Information
    collectBrowserInfo();
    
    // System Information
    collectSystemInfo();
    
    // Network Information
    await collectNetworkInfo();
    
    // Time Information
    collectTimeInfo();
    
    // Hardware & Sensors
    await collectHardwareInfo();
    
    // Storage & Features
    await collectStorageInfo();
    
    // Security & Privacy
    collectSecurityInfo();
    
    // Update time every second
    setInterval(updateTime, 1000);
}

function collectScreenInfo() {
    document.getElementById('screenResolution').textContent = `${screen.width} × ${screen.height}`;
    document.getElementById('availableScreen').textContent = `${screen.availWidth} × ${screen.availHeight}`;
    document.getElementById('windowSize').textContent = `${window.outerWidth} × ${window.outerHeight}`;
    document.getElementById('viewport').textContent = `${window.innerWidth} × ${window.innerHeight}`;
    document.getElementById('colorDepth').textContent = `${screen.colorDepth}-bit`;
    document.getElementById('pixelDensity').textContent = `${window.devicePixelRatio}x`;
    document.getElementById('orientation').textContent = screen.orientation ? 
        `${screen.orientation.type} (${screen.orientation.angle}°)` : 
        window.innerWidth > window.innerHeight ? 'Landscape' : 'Portrait';
}

function collectBrowserInfo() {
    const browserInfo = getBrowserInfo();
    document.getElementById('browserName').textContent = browserInfo.name;
    document.getElementById('browserVersion').textContent = browserInfo.version;
    document.getElementById('browserEngine').textContent = browserInfo.engine;
    document.getElementById('userAgent').textContent = navigator.userAgent;
    document.getElementById('languages').textContent = navigator.languages ? 
        navigator.languages.join(', ') : navigator.language;
    document.getElementById('cookiesEnabled').textContent = navigator.cookieEnabled ? 'Yes' : 'No';
    document.getElementById('doNotTrack').textContent = navigator.doNotTrack || 'Not set';
}

function getBrowserInfo() {
    const ua = navigator.userAgent;
    let name = 'Unknown';
    let version = 'Unknown';
    let engine = 'Unknown';

    // Browser detection
    if (ua.includes('Firefox')) {
        name = 'Firefox';
        version = ua.match(/Firefox\/(\d+\.\d+)/)?.[1] || 'Unknown';
        engine = 'Gecko';
    } else if (ua.includes('Chrome') && !ua.includes('Edg')) {
        name = 'Chrome';
        version = ua.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/)?.[1] || 'Unknown';
        engine = 'Blink';
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
        name = 'Safari';
        version = ua.match(/Version\/(\d+\.\d+)/)?.[1] || 'Unknown';
        engine = 'WebKit';
    } else if (ua.includes('Edg')) {
        name = 'Edge';
        version = ua.match(/Edg\/(\d+\.\d+\.\d+\.\d+)/)?.[1] || 'Unknown';
        engine = 'Blink';
    } else if (ua.includes('Opera') || ua.includes('OPR')) {
        name = 'Opera';
        version = ua.match(/(Opera|OPR)\/(\d+\.\d+)/)?.[2] || 'Unknown';
        engine = 'Blink';
    }

    return { name, version, engine };
}

function collectSystemInfo() {
    const platform = navigator.platform || navigator.userAgentData?.platform || 'Unknown';
    const os = getOperatingSystem();
    
    document.getElementById('operatingSystem').textContent = os;
    document.getElementById('platform').textContent = platform;
    
    // Enhanced Architecture Detection
    let architecture = 'Unknown';
    if (navigator.userAgentData?.architecture) {
        architecture = navigator.userAgentData.architecture;
    } else {
        // Fallback methods for architecture detection
        const ua = navigator.userAgent.toLowerCase();
        const platform_lower = platform.toLowerCase();
        
        if (platform_lower.includes('win64') || platform_lower.includes('x64') || 
            platform_lower.includes('amd64') || ua.includes('x64') || ua.includes('win64')) {
            architecture = 'x64 (64-bit)';
        } else if (platform_lower.includes('win32') || platform_lower.includes('x86') || 
                   ua.includes('x86') || ua.includes('i386') || ua.includes('i686')) {
            architecture = 'x86 (32-bit)';
        } else if (platform_lower.includes('arm') || ua.includes('arm')) {
            if (ua.includes('arm64') || ua.includes('aarch64')) {
                architecture = 'ARM64 (64-bit)';
            } else {
                architecture = 'ARM (32-bit)';
            }
        } else if (ua.includes('ppc') || ua.includes('powerpc')) {
            architecture = 'PowerPC';
        } else if (platform_lower.includes('mac') || platform_lower.includes('darwin')) {
            // Try to detect Apple Silicon vs Intel
            if (ua.includes('intel') || platform_lower.includes('intel')) {
                architecture = 'x64 (Intel Mac)';
            } else {
                architecture = 'ARM64 (Apple Silicon)';
            }
        } else if (os === 'Android' || os === 'iOS') {
            architecture = 'ARM (Mobile)';
        }
    }
    
    document.getElementById('architecture').textContent = architecture;
    document.getElementById('cpuCores').textContent = navigator.hardwareConcurrency || 'Unknown';
    
    // Enhanced Device Memory Detection
    let deviceMemory = 'Unknown';
    if (navigator.deviceMemory) {
        deviceMemory = `${navigator.deviceMemory} GB`;
    } else {
        // Fallback: Estimate based on other factors
        const cores = navigator.hardwareConcurrency;
        const isDesktop = !navigator.userAgent.includes('Mobile') && !navigator.userAgent.includes('Android');
        
        if (cores && isDesktop) {
            // Rough estimation for desktop systems
            if (cores >= 8) {
                deviceMemory = '16+ GB (estimated)';
            } else if (cores >= 4) {
                deviceMemory = '8-16 GB (estimated)';
            } else if (cores >= 2) {
                deviceMemory = '4-8 GB (estimated)';
            } else {
                deviceMemory = '2-4 GB (estimated)';
            }
        } else if (cores) {
            // Mobile/tablet estimation
            if (cores >= 8) {
                deviceMemory = '6-12 GB (estimated)';
            } else if (cores >= 4) {
                deviceMemory = '3-8 GB (estimated)';
            } else {
                deviceMemory = '1-4 GB (estimated)';
            }
        } else {
            // Try to estimate based on performance
            if (typeof performance !== 'undefined' && performance.memory) {
                const heapSizeMB = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
                if (heapSizeMB > 2000) {
                    deviceMemory = '8+ GB (JS heap estimation)';
                } else if (heapSizeMB > 1000) {
                    deviceMemory = '4-8 GB (JS heap estimation)';
                } else {
                    deviceMemory = '2-4 GB (JS heap estimation)';
                }
            }
        }
    }
    
    document.getElementById('deviceMemory').textContent = deviceMemory;
    document.getElementById('maxTouchPoints').textContent = navigator.maxTouchPoints || 0;
}

function getOperatingSystem() {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    return 'Unknown';
}

async function collectNetworkInfo() {
    // IP Address and location
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        document.getElementById('ipAddress').textContent = data.ip || 'Unknown';
        document.getElementById('isp').textContent = data.org || 'Unknown';
        document.getElementById('location').textContent = 
            `${data.city || 'Unknown'}, ${data.region || 'Unknown'}, ${data.country_name || 'Unknown'}`;
    } catch (error) {
        document.getElementById('ipAddress').textContent = 'Unable to fetch';
        document.getElementById('isp').textContent = 'Unable to fetch';
        document.getElementById('location').textContent = 'Unable to fetch';
    }

    // Network status
    document.getElementById('onlineStatus').textContent = navigator.onLine ? 'Online' : 'Offline';
    
    // Connection information
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
        // Connection type with more detailed info
        let connectionType = 'Unknown';
        if (connection.effectiveType) {
            connectionType = connection.effectiveType;
            if (connection.type && connection.type !== connection.effectiveType) {
                connectionType += ` (${connection.type})`;
            }
        } else if (connection.type) {
            connectionType = connection.type;
        }
        
        document.getElementById('connectionType').textContent = connectionType;
        
        // Downlink with additional info
        let downlinkInfo = 'Unknown';
        if (connection.downlink !== undefined) {
            downlinkInfo = `${connection.downlink} Mbps`;
            if (connection.rtt !== undefined) {
                downlinkInfo += ` (RTT: ${connection.rtt}ms)`;
            }
        } else if (connection.rtt !== undefined) {
            downlinkInfo = `RTT: ${connection.rtt}ms`;
        }
        
        document.getElementById('downlink').textContent = downlinkInfo;
    } else {
        // Fallback: Try to estimate connection based on other factors
        let estimatedConnection = 'Unknown';
        let estimatedSpeed = 'Unknown';
        
        // Try to estimate based on user agent and other hints
        if (navigator.userAgent.includes('Mobile') || navigator.userAgent.includes('Android')) {
            estimatedConnection = 'Mobile (estimated)';
        } else {
            estimatedConnection = 'Desktop/WiFi (estimated)';
        }
        
        // Try performance timing for rough speed estimation
        if ('performance' in window && performance.timing) {
            const timing = performance.timing;
            const loadTime = timing.loadEventEnd - timing.navigationStart;
            if (loadTime > 0 && loadTime < 1000) {
                estimatedSpeed = 'Fast connection (estimated)';
            } else if (loadTime < 3000) {
                estimatedSpeed = 'Medium connection (estimated)';
            } else {
                estimatedSpeed = 'Slow connection (estimated)';
            }
        }
        
        document.getElementById('connectionType').textContent = estimatedConnection;
        document.getElementById('downlink').textContent = estimatedSpeed;
    }

    // Timezone
    document.getElementById('timezone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function collectTimeInfo() {
    updateTime();
    
    const offset = new Date().getTimezoneOffset();
    const hours = Math.abs(Math.floor(offset / 60));
    const minutes = Math.abs(offset % 60);
    const sign = offset > 0 ? '-' : '+';
    
    document.getElementById('timezoneOffset').textContent = 
        `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    document.getElementById('locale').textContent = navigator.language || 'Unknown';
}

function updateTime() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleString();
    document.getElementById('utcTime').textContent = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

async function collectHardwareInfo() {
    // Enhanced Battery API Detection
    let batteryDetected = false;
    
    // Try multiple battery API access methods
    if ('getBattery' in navigator) {
        try {
            const battery = await navigator.getBattery();
            const level = Math.round(battery.level * 100);
            const charging = battery.charging ? 'Charging' : 'Not charging';
            let timeInfo = '';
            
            if (battery.charging && battery.chargingTime !== Infinity) {
                const hours = Math.floor(battery.chargingTime / 3600);
                const minutes = Math.floor((battery.chargingTime % 3600) / 60);
                timeInfo = ` (${hours}h ${minutes}m to full)`;
            } else if (!battery.charging && battery.dischargingTime !== Infinity) {
                const hours = Math.floor(battery.dischargingTime / 3600);
                const minutes = Math.floor((battery.dischargingTime % 3600) / 60);
                timeInfo = ` (${hours}h ${minutes}m remaining)`;
            }
            
            document.getElementById('batteryStatus').textContent = 
                `${level}% ${charging}${timeInfo}`;
            batteryDetected = true;
        } catch (error) {
            console.log('Battery API error:', error);
        }
    }
    
    // Fallback methods if battery API not available
    if (!batteryDetected) {
        // Check if device is likely battery-powered
        const ua = navigator.userAgent;
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        const isTablet = /iPad|Android.*Tablet|Windows.*Touch/i.test(ua);
        
        // Better laptop detection
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isWindows = ua.includes('Windows');
        const isMac = ua.includes('Mac');
        const isLinux = ua.includes('Linux') && !ua.includes('Android');
        
        // Most laptops and portable devices have touch capability or are explicitly mobile
        const isLikelyLaptop = (isWindows || isMac || isLinux) && 
                              (!ua.includes('Desktop') && 
                               (hasTouch || 
                                ua.includes('Mobile') || 
                                window.screen.width <= 1920 || // Most laptops are 1920px or less
                                window.devicePixelRatio > 1)); // Many laptops have high DPI displays
        
        if (isMobile) {
            document.getElementById('batteryStatus').textContent = 'Mobile device (API restricted)';
        } else if (isTablet) {
            document.getElementById('batteryStatus').textContent = 'Tablet device (API restricted)';
        } else if (isLikelyLaptop) {
            document.getElementById('batteryStatus').textContent = 'Laptop (API not available)';
        } else {
            // Only assume desktop if we're confident it's not portable
            const isLikelyDesktop = (isWindows || isMac || isLinux) && 
                                  !hasTouch && 
                                  !ua.includes('Mobile') && 
                                  window.screen.width > 1920 &&
                                  window.devicePixelRatio <= 1;
            
            if (isLikelyDesktop) {
                document.getElementById('batteryStatus').textContent = 'Desktop (likely no battery)';
            } else {
                document.getElementById('batteryStatus').textContent = 'Portable device (API not available)';
            }
        }
    }

    // Device orientation
    if ('DeviceOrientationEvent' in window) {
        // Check if we can actually get orientation data
        let orientationSupported = false;
        
        const orientationHandler = function(event) {
            if (event.alpha !== null || event.beta !== null || event.gamma !== null) {
                orientationSupported = true;
                document.getElementById('deviceOrientation').textContent = 
                    `α: ${Math.round(event.alpha || 0)}° β: ${Math.round(event.beta || 0)}° γ: ${Math.round(event.gamma || 0)}°`;
                window.removeEventListener('deviceorientation', orientationHandler);
            }
        };
        
        window.addEventListener('deviceorientation', orientationHandler);
        
        // Fallback after 2 seconds if no data received
        setTimeout(() => {
            if (!orientationSupported) {
                window.removeEventListener('deviceorientation', orientationHandler);
                if (navigator.userAgent.includes('Mobile') || navigator.userAgent.includes('Android')) {
                    document.getElementById('deviceOrientation').textContent = 'Mobile (permission required)';
                } else {
                    document.getElementById('deviceOrientation').textContent = 'Desktop (not applicable)';
                }
            }
        }, 2000);
    } else {
        document.getElementById('deviceOrientation').textContent = 'Not supported by browser';
    }

    // Gamepad detection
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const connectedGamepads = Array.from(gamepads).filter(gp => gp !== null);
    document.getElementById('gamepadConnected').textContent = 
        connectedGamepads.length > 0 ? `Yes (${connectedGamepads.length})` : 'No';

    // WebGL information
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            document.getElementById('webglRenderer').textContent = 
                gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown';
            document.getElementById('webglVendor').textContent = 
                gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown';
        } else {
            document.getElementById('webglRenderer').textContent = 'Available but masked';
            document.getElementById('webglVendor').textContent = 'Available but masked';
        }
    } else {
        document.getElementById('webglRenderer').textContent = 'Not supported';
        document.getElementById('webglVendor').textContent = 'Not supported';
    }
}

async function collectStorageInfo() {
    // Local Storage
    try {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
        
        // Try to estimate storage usage
        let localStorageSize = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                localStorageSize += localStorage[key].length + key.length;
            }
        }
        
        document.getElementById('localStorage').textContent = 
            `Available (${Object.keys(localStorage).length} items, ~${Math.round(localStorageSize/1024)}KB used)`;
    } catch (e) {
        document.getElementById('localStorage').textContent = 'Not available';
    }

    // Session Storage
    try {
        sessionStorage.setItem('test', 'test');
        sessionStorage.removeItem('test');
        
        let sessionStorageSize = 0;
        for (let key in sessionStorage) {
            if (sessionStorage.hasOwnProperty(key)) {
                sessionStorageSize += sessionStorage[key].length + key.length;
            }
        }
        
        document.getElementById('sessionStorage').textContent = 
            `Available (${Object.keys(sessionStorage).length} items, ~${Math.round(sessionStorageSize/1024)}KB used)`;
    } catch (e) {
        document.getElementById('sessionStorage').textContent = 'Not available';
    }

    // IndexedDB with version info
    if ('indexedDB' in window) {
        try {
            // Try to get storage estimate
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                const estimate = await navigator.storage.estimate();
                const usedMB = Math.round(estimate.usage / 1024 / 1024 * 100) / 100;
                const quotaMB = Math.round(estimate.quota / 1024 / 1024);
                document.getElementById('indexedDB').textContent = 
                    `Available (${usedMB}MB used / ${quotaMB}MB quota)`;
            } else {
                document.getElementById('indexedDB').textContent = 'Available (quota unknown)';
            }
        } catch (e) {
            document.getElementById('indexedDB').textContent = 'Available (quota unavailable)';
        }
    } else {
        document.getElementById('indexedDB').textContent = 'Not available';
    }

    // WebRTC with detailed capabilities
    if ('RTCPeerConnection' in window) {
        try {
            const pc = new RTCPeerConnection();
            const hasDataChannel = typeof pc.createDataChannel === 'function';
            pc.close();
            document.getElementById('webRTC').textContent = 
                `Available (DataChannel: ${hasDataChannel ? 'Yes' : 'No'})`;
        } catch (e) {
            document.getElementById('webRTC').textContent = 'Available (limited)';
        }
    } else {
        document.getElementById('webRTC').textContent = 'Not available';
    }

    // Service Workers with registration info
    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            document.getElementById('serviceWorkers').textContent = 
                `Available (${registrations.length} registered)`;
        } catch (e) {
            document.getElementById('serviceWorkers').textContent = 'Available (registration check failed)';
        }
    } else {
        document.getElementById('serviceWorkers').textContent = 'Not available';
    }

    // Push Notifications with permission status
    if ('PushManager' in window && 'Notification' in window) {
        const permission = Notification.permission;
        document.getElementById('pushNotifications').textContent = 
            `Available (Permission: ${permission})`;
    } else {
        document.getElementById('pushNotifications').textContent = 'Not available';
    }
}

function collectSecurityInfo() {
    // HTTPS
    document.getElementById('https').textContent = location.protocol === 'https:' ? 'Yes' : 'No';

    // Referrer
    document.getElementById('referrer').textContent = document.referrer || 'Direct/No referrer';

    // Java
    document.getElementById('javaEnabled').textContent = navigator.javaEnabled() ? 'Yes' : 'No';

    // Adobe Flash (deprecated but still worth checking)
    let flashEnabled = false;
    try {
        flashEnabled = navigator.plugins['Shockwave Flash'] !== undefined;
    } catch (e) {
        // Ignore
    }
    document.getElementById('adobeFlash').textContent = flashEnabled ? 'Detected' : 'Not detected';

    // Ad Blocker Detection
    detectAdBlocker();
}

function detectAdBlocker() {
    // Simple ad blocker detection
    const adElement = document.createElement('div');
    adElement.innerHTML = '&nbsp;';
    adElement.className = 'adsbox';
    adElement.style.position = 'absolute';
    adElement.style.left = '-9999px';
    document.body.appendChild(adElement);

    setTimeout(() => {
        const isBlocked = adElement.offsetHeight === 0 || 
                         window.getComputedStyle(adElement).display === 'none';
        document.getElementById('adBlocker').textContent = isBlocked ? 'Detected' : 'Not detected';
        document.body.removeChild(adElement);
    }, 100);
}

// Monitor online/offline status changes
window.addEventListener('online', () => {
    document.getElementById('onlineStatus').textContent = 'Online';
});

window.addEventListener('offline', () => {
    document.getElementById('onlineStatus').textContent = 'Offline';
});

// Monitor gamepad connections
window.addEventListener('gamepadconnected', () => {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const connectedGamepads = Array.from(gamepads).filter(gp => gp !== null);
    document.getElementById('gamepadConnected').textContent = 
        connectedGamepads.length > 0 ? `Yes (${connectedGamepads.length})` : 'No';
});

window.addEventListener('gamepaddisconnected', () => {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const connectedGamepads = Array.from(gamepads).filter(gp => gp !== null);
    document.getElementById('gamepadConnected').textContent = 
        connectedGamepads.length > 0 ? `Yes (${connectedGamepads.length})` : 'No';
});

// Monitor window resize
window.addEventListener('resize', () => {
    document.getElementById('windowSize').textContent = `${window.outerWidth} × ${window.outerHeight}`;
    document.getElementById('viewport').textContent = `${window.innerWidth} × ${window.innerHeight}`;
    document.getElementById('orientation').textContent = screen.orientation ? 
        `${screen.orientation.type} (${screen.orientation.angle}°)` : 
        window.innerWidth > window.innerHeight ? 'Landscape' : 'Portrait';
});