import { LayerController } from './layerController.js';
import {SyncController, syncImageLoad, displayedColorbar, currentDomain, overlayOrder, current_timestamp, rasters, raster_base, sorted_timestamps} from './Controller.js';
import {map} from '../util.js';
import {TimeSeriesMarker} from './timeSeriesMarker.js';
import { TimeSeriesButton } from './timeSeriesButton.js';

/** This class extends LayerController and adds to it functionality for generating a timeseries
 * mapping a specific pixel value to its corresponing location on the colorbar over a certain time
 * range in the simulation. Uses the layer that is on top. To use, double click on image to bring up
 * a popup showing the value of the pixel at that particular time stamp as well as a button to 
 * generate a timeseries of the pixel over a specified range. The first time a timeseries is generated,
 * since it will need to fetch every single image in the specified range it will take longer to load. 
 * Every subsequent timeseries generated for a layer will be significantly sped up.
 */
export class TimeSeriesController extends LayerController {
    constructor() {
        super();
        this.timeSeriesButton = new TimeSeriesButton();
        this.timeSeriesButton.getButton().disabled = true;
        const container = this.querySelector('#layer-controller-container');
        const timeSeriesDiv = document.createElement('div');
        timeSeriesDiv.className = 'layer-group';
        timeSeriesDiv.id = 'timeseries-layer-group';
        const span = document.createElement('span');
        span.innerText = "Timeseries over all Markers";
        timeSeriesDiv.appendChild(span);
        timeSeriesDiv.appendChild(this.timeSeriesButton);
        container.appendChild(timeSeriesDiv);
        this.imgCanvas = null;
        this.clrbarCanvas = null;
        this.clrbarMap = {};
        this.markers = [];
        this.canvasMaxHeight = 10000;
    }

    connectedCallback() {
        super.connectedCallback();
        // When both a layer and its colorbar have loaded, update the timeSeries canvases
        syncImageLoad.subscribe(() => {
            if (displayedColorbar.getValue()) {
                const rasterColorbar = document.querySelector('#raster-colorbar');
                var layerImage = this.getLayer(displayedColorbar.getValue())._image;
                this.updateCanvases(layerImage, rasterColorbar);
            }
        });
        this.timeSeriesButton.getButton().onclick = async () => {
            document.body.classList.add("waiting");
            var startDate = this.timeSeriesButton.getStartDate();
            var endDate = this.timeSeriesButton.getEndDate();
            var timeSeriesData = await this.generateTimeSeriesData(this.timeSeriesButton, startDate, endDate, this.markers);
            document.body.classList.remove("waiting");
            const timeSeriesChart = document.querySelector('timeseries-chart');
            timeSeriesChart.populateChart(timeSeriesData);
        }
    }

    /** When domain is switched, remove all timeSeries markers. */
    domainSwitch() {
        this.timeSeriesButton.updateTimestamps();
        super.domainSwitch();
        while (this.markers.length > 0) {
            this.markers[0].removeFrom(map);
        }
        this.handleOverlayadd('T2');
        // const timeSeriesChart = document.querySelector('timeseries-chart');
        // displayedColorbar.setValue('test');
        // var dataset = [];
        // dataset.push({label: 'test', latLon: {lat: 1, lng: 0}, rgb: [0, 0, 0], dataset: {'2020-10-15 17:00:00': 12, '2020-10-15 18:00:00': 19, '2020-10-15 19:00:00': 20}});
        // dataset.push({label: 'test2', latLon: {lat: 1, lng: 0}, rgb: [0, 180, 0], dataset: {'2020-10-15 17:00:00': 18, '2020-10-15 18:00:00': 12, '2020-10-15 19:00:00': 10}});
        // timeSeriesChart.populateChart(dataset);
    }

    /** If a colorbar is included in the new added layer, need to set it up for timeSeries:
     * Update the current canvases and markers to point to the new layer and create a callback to 
     * build a new marker when the new layer is double clicked. */
    handleOverlayadd(name) {
        super.handleOverlayadd(name);
        var rasters_now = rasters.getValue()[currentDomain.getValue()][current_timestamp.getValue()];
        var raster_info = rasters_now[name];
        var layer = this.getLayer(name);
        var img = layer._image;
        const rasterColorbar = document.querySelector('#raster-colorbar');
        if ('colorbar' in raster_info) {
            img.ondblclick = (e) => {
                var latLon = map.mouseEventToLatLng(e);
                e.stopPropagation(); // needed because otherwise immediately closes the popup
                var xCoord = e.offsetX / img.width;
                var yCoord = e.offsetY / img.height;
                this.createNewMarker(latLon, xCoord, yCoord);
                this.timeSeriesButton.getButton().disabled = false;
            }
            img.onload = () => syncImageLoad.increment(0);
            rasterColorbar.onload = () => syncImageLoad.increment(1);
            map.on('zoomend', () => {
                if (img.height < this.canvasMaxHeight) {
                    this.imgCanvas = this.drawCanvas(img);
                }
            });
            this.updateCanvases(img, rasterColorbar); // needed because sometimes layer is already loaded
            if (this.markers.length > 0) {
                this.timeSeriesButton.getButton().disabled = false;
            }
        } else img.style.pointerEvents = 'none';
    }

    createNewMarker(latLon, xCoord, yCoord) {
        var marker = L.popup({closeOnClick: false, autoClose: false, autoPan: false}).setLatLng([latLon.lat, latLon.lng]).openOn(map);
        marker.imageCoords = [xCoord, yCoord];
        this.markers.push(marker);
        marker.on('remove', () => {
            this.markers.splice(this.markers.indexOf(marker), 1);
            if (this.markers.length == 0) {
                this.timeSeriesButton.getButton().disabled = true;
            }
        });
        const timeSeriesChart = document.querySelector('timeseries-chart');
        const timeSeriesMarker = new TimeSeriesMarker(latLon);
        const timeSeriesButton = timeSeriesMarker.getButton();
        marker.setContent(timeSeriesMarker);
        timeSeriesButton.onclick = async () => {
            var startDate = timeSeriesMarker.getStartDate();
            var endDate = timeSeriesMarker.getEndDate();
            var timeSeriesData = await this.generateTimeSeriesData(timeSeriesMarker, startDate, endDate, [marker]);
            timeSeriesChart.populateChart(timeSeriesData);
        }
        this.updateMarker(marker);
    }

    /** When removing a layer, need to find the most recent colorbar and update the timeSeries canvases
     * to that layer. */
    handleOverlayRemove(name) {
        super.handleOverlayRemove(name);
        const rasterColorbar = document.querySelector('#raster-colorbar');
        var rasters_now = rasters.getValue()[currentDomain.getValue()][current_timestamp.getValue()];
        var img = null;
        for (var i = overlayOrder.length - 1; i >= 0; i--) {
            if ('colorbar' in rasters_now[overlayOrder[i]]) {
                img = this.getLayer(overlayOrder[i])._image;
                break;
            }
        }
        if (!displayedColorbar.getValue()) {
            this.timeSeriesButton.getButton().disabled = true;
        }
        this.updateCanvases(img, rasterColorbar);
    }

    /** Redraws the clrbarCanvas and imgCanvas used to map values for the timeSeries with 
     * given img elements. Updates the map of rgb values to colorbar locations. Updates every 
     * marker to reflec values in the new img and colorbar */
    updateCanvases(layerImg, colorbarImg) {
        this.imgCanvas = this.drawCanvas(layerImg);
        this.clrbarCanvas = this.drawCanvas(colorbarImg);
        this.clrbarMap = this.buildColorMap(this.clrbarCanvas);
        for (var marker of this.markers) {
            this.updateMarker(marker);
        }
    }

    /** returns a canvas drawn with given image. */
    drawCanvas(img) {
        var canvas = null;
        if (img != null) {
            var factor = 1; 
            if (img.height > this.canvasMaxHeight) {
                factor = this.canvasMaxHeight / img.height;
            }
            canvas = document.createElement('canvas');
            canvas.width = img.width * factor;
            canvas.height = img.height * factor;
            canvas.getContext('2d').drawImage(img, 0, 0, img.width*factor, img.height*factor);
        }
        return canvas;
    }

    /** Maps location of marker to position on colorbar for current layer image and colorbar.
     * Updates the content of the marker. */
    updateMarker(marker) {
        var rgb = [0, 0, 0];
        var clrbarLocation = null;
        if (this.imgCanvas) {
            var [xCoord, yCoord] = marker.imageCoords;
            var x = Math.floor(xCoord * this.imgCanvas.width);
            var y = Math.floor(yCoord * this.imgCanvas.height);
            var pixelData = this.imgCanvas.getContext('2d').getImageData(x, y, 1, 1).data;
            rgb = [pixelData[0], pixelData[1], pixelData[2]];
            clrbarLocation = this.findClosestKey(rgb, this.clrbarMap);
        }
        marker.getContent().setRGBValues(rgb, clrbarLocation);
    }
    
    /** Iterates over all keys in clrbarMap and finds closest one to given rgb values. Returns relative 
     * location in clrbarMap. */
    findClosestKey(rgb, clrbarMap) {
        var [r, g, b] = rgb;
        if (r + g + b == 0) {
            return 0;
        }
        const createKey = (r, g, b) => r + ',' + g + ',' + b;
        const mapKey = (key) => key.split(',').map(str => parseInt(str));
        var closestKey = createKey(r, g, b);
        if (closestKey in clrbarMap){
            return clrbarMap[closestKey];
        }
        var minDiff = 255*3 + 1;
        for (var key in clrbarMap) {
            var [rk, gk, bk] = mapKey(key);
            var newDiff = Math.abs(r - rk) + Math.abs(g - gk) + Math.abs(b - bk);
            if (newDiff < minDiff) {
                minDiff = newDiff;
                closestKey = createKey(rk, gk, bk);
            }
        };
        return clrbarMap[closestKey];
    }

    /** Function called for populating a timeSeries chart. Needs to load image and colorbar pair
     * for given timestamp of given rasterDomains. Once image loaded, should map given xCoord and yCoord
     * to an rgb value and find its corresponding place in the colormap. Puts the colorbar location into the 
     * given timeSeriesData dictionary under timeStamp key. Should not return until both the image and 
     * colorbar have been loaded and the timeSeriesData has been populated. */
    async loadImageAndColorbar(timeSeriesData, timeStamp, markers) {
        var rasterDomains = rasters.getValue()[currentDomain.getValue()];
        var layerImg = this.getLayer(displayedColorbar.getValue())._image;
        var factor = 1;
        if (layerImg.height >= this.canvasMaxHeight) {
            factor = this.canvasMaxHeight / layerImg.height;
        }
        var img = new Image();
        img.width = layerImg.width*factor;
        img.height = layerImg.height*factor;
        var convertX = (xCoord) => Math.floor(xCoord * layerImg.width*factor);
        var convertY = (yCoord) => Math.floor(yCoord * layerImg.height*factor);
        var clrbarImg = new Image();
        // Returns a promise so that loadImageAndColorbar can be called with await. 
        return new Promise(resolve => {
            var rasterAtTime = rasterDomains[timeStamp];
            var rasterInfo = rasterAtTime[displayedColorbar.getValue()];
            var clrbarMap = {};
            var imgCanvas;
            var syncController = new SyncController();
            syncController.subscribe(() => {
                for (var i = 0; i < markers.length; i++) {
                    var [xCoord, yCoord] = markers[i].imageCoords;
                    var x = convertX(xCoord);
                    var y = convertY(yCoord);
                    var pixelData = imgCanvas.getContext('2d').getImageData(x, y, 1, 1).data; 
                    timeSeriesData[i].dataset[timeStamp] = this.findClosestKey([pixelData[0], pixelData[1], pixelData[2]], clrbarMap)
                }
                resolve('resolved'); // timeSeriesData has been populated. can now resolve.
            });
            img.onload = () => {
                imgCanvas = this.drawCanvas(img);
                syncController.increment(0);
            }
            clrbarImg.onload = () => {
                var clrbarCanvas = this.drawCanvas(clrbarImg);
                clrbarMap = this.buildColorMap(clrbarCanvas);
                syncController.increment(1);
            }
            var imgURL = raster_base.getValue() + rasterInfo.raster;
            var clrbarURL = raster_base.getValue() + rasterInfo.colorbar;
            if (imgURL in this.preloaded && clrbarURL in this.preloaded) {
                imgURL = this.preloaded[imgURL];
                clrbarURL = this.preloaded[clrbarURL];
            } else {
                this.worker.terminate();
                this.preloaded[imgURL] = imgURL;
                this.preloaded[clrbarURL] = clrbarURL;
            }
            img.src = imgURL;
            clrbarImg.src = clrbarURL;
        });
    }

    /** Iterates over all timestamps in given range of current simulation, loads the corresponding image and colorbar,
     * and adds the value of the color at the xCoord, yCoord in the colorbar to a dictionary under a key representing
     * the corresponding timestamp. */
    async generateTimeSeriesData(progressMarker, startDate, endDate, markers) {
        document.body.classList.add("waiting");
        progressMarker.setProgress(0);
        var filteredTimeStamps = sorted_timestamps.getValue().filter(timestamp => timestamp >= startDate && timestamp <= endDate);
        var progress = 0;
        var timeSeriesData = [];
        for (var i = 0; i < markers.length; i++) {
            var timeSeriesMarker = markers[i].getContent();
            timeSeriesData.push({label: timeSeriesMarker.getName(), latLon: markers[i]._latlng, rgb: timeSeriesMarker.getRGB(), dataset: {}});
        }
        for (var timeStamp of filteredTimeStamps) {
            await this.loadImageAndColorbar(timeSeriesData, timeStamp, markers);
            progress += 1;
            progressMarker.setProgress(progress/filteredTimeStamps.length);
        }
        document.body.classList.remove("waiting");
        return timeSeriesData;
    }

    mapLevels(clrbarCanvas, clrbarMap) {
        var levelMap = {};
        if (displayedColorbar.getValue() == null) {
            return;
        }
        var rasters_now = rasters.getValue()[currentDomain.getValue()][current_timestamp.getValue()];
        var raster_info = rasters_now[displayedColorbar.getValue()];
        var levels = raster_info.levels;
        var x = clrbarMap.left - 5;
        if (!levels) {
            return;
        }
        var stratified = false;
        if (Object.keys(clrbarMap).length - 10 < levels.length) {
            stratified = true;
        }
        var levelIndex = levels.length - 1;
        if (stratified) {
            levelMap[0] = 0;
        }
        var coord1 = [];
        var coord2 = [];
        const computeLocation = (y) => 1 - (y - clrbarMap.start) / (clrbarMap.end - clrbarMap.start);
        for (var y = 0; y < clrbarCanvas.height; y++) {
            if (levelIndex < 0) {
                break;
            }
            var colorbarData = clrbarCanvas.getContext('2d').getImageData(x, y, 1, 1).data;
            if (colorbarData[3] != 0) {
                var location = computeLocation(y);
                levelMap[location] = levels[levelIndex];
                if (coord2.length == 0) {
                    coord2 = [location, levels[levelIndex]];
                }
                else {
                    coord1 = [location, levels[levelIndex]];
                }
                levelIndex = levelIndex - 1;
                y += 5;
            }
        }
        var slope = (coord2[1] - coord1[1]) / (coord2[0] - coord1[0]);
        const interpolate = (location) => {
            if (!stratified) {
                return slope*(location - coord1[0]) + coord1[1];
            }
            // find closest key in levelMap
            var closestKey = location;
            var minDistance = 1;
            for (var key in levelMap) {
                var distance = Math.abs(key - location);
                if (distance < minDistance) {
                    closestKey = key;
                    minDistance = distance;
                }
            }
            return levelMap[closestKey];
        }
        for (var color in clrbarMap) {
            clrbarMap[color] = interpolate(clrbarMap[color]);
        }
    }

    /** Builds a map of rgb values in a colorbar to its height in the colorbar. Also includes the start and 
     * end pixels of the colorbar so that relative positions in the colobar can be calculated. Starts from a 
     * y value half the height of the image and iterates over x until a non black pixel is located. Advances one
     * more pixel away to avoid distortion and sets this as the xCoordinate band that the colorbard spans. Then
     * iterates over the height of the colorbar keeping the xCoord constant mapping the value of the rgb value 
     * to the yCoord. */
    buildColorMap(clrbarCanvas) {
        var clrbarMap = {};
        if (!clrbarCanvas) {
            return clrbarMap;
        }
        var right = 0;
        var left = 0;
        var y = Math.round(clrbarCanvas.height / 2);
        for (var x = clrbarCanvas.width - 1; x > 0; x--) {
            var colorbarData = clrbarCanvas.getContext('2d').getImageData(x, y, 1, 1).data;
            if (right == 0) {
                if (colorbarData[0] + colorbarData[1] + colorbarData[2] != 0) {
                    right = x;
                }
            } else {
                if (colorbarData[0] + colorbarData[1] + colorbarData[2] == 0) {
                    left = x;
                    x = Math.floor((right + left)/2);
                    break;
                }
            }
        }
        var start = 0;
        var end = 0;
        for (var j = 0; j < clrbarCanvas.height; j++) {
            var colorbarData = clrbarCanvas.getContext('2d').getImageData(x, j, 1, 1).data;
            var r = colorbarData[0];
            var g = colorbarData[1];
            var b = colorbarData[2];
            if (start == 0) {
                if (r + g + b != 0) {
                    start = j + 1;
                }
            } else {
                if (r + g + b == 0) {
                    end = j - 1;
                    break;
                }
            }
            clrbarMap[r + ',' + g + ',' + b] = j;
        }
        const computeLocation = (key) => 1 - (clrbarMap[key] - start) / (end - start);
        for (var rgbKey in clrbarMap) {
            clrbarMap[rgbKey] = computeLocation(rgbKey);
        }
        clrbarMap.start = start;
        clrbarMap.end = end;
        clrbarMap.right = right;
        clrbarMap.left = left;
        this.mapLevels(clrbarCanvas, clrbarMap);
        return clrbarMap;
    }
}

window.customElements.define('timeseries-controller', TimeSeriesController);