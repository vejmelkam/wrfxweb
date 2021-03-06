import { utcToLocal, createOption, linkSelects, localToUTC, setURL } from '../util.js';
import { controllers } from '../components/Controller.js';
import { simVars } from '../simVars.js';

export class TimeSeriesChart extends HTMLElement {
    constructor() {
        super();
        this.innerHTML = `
            <link rel='stylesheet' href='css/timeSeriesChart.css'/>
            <div id='timeSeriesChartContainer'>
                <div id='zoomBox'></div>
                <span id='closeTimeSeriesChart'>x</span>
                <button id='undo-zoom' style='display:none'>
                    <img height=10 width=10 src='icons/undo_black_24dp.svg'></img>
                </button>
                <canvas id='timeSeriesChart' width='400px' height='400px'></canvas>
                <div id='break' style='width: 100%; height: 1px; background: #5d5d5d'></div>
                <div id='add-threshold' style='margin-top: 10px'>
                    <label style='display: inline-block; width: 100px' for='threshold-setter'>y-axis threshold: </label>
                    <input id='threshold-setter' style='margin-right:10px; width: 150px'></input>
                    <label style='display: inline-block; width: 100px' for='threshold-label'>threshold label: </label>
                    <input id='threshold-label' style='width: 150px'></input>
                </div>
                <div id='zoomIn' style='display: inline-block; margin-top: 10px'>
                    <label style='display: inline-block; width: 100px' for='zoom-start'>zoom in start: </label>
                    <select id='zoom-start' style='width: 160px; margin-right:10px'></select>
                    <label style='display: inline-block; width: 100px' for='zoom-end'>zoom in end: </label>
                    <select id='zoom-end' style='width: 160px'></select>
                </div>
            </div>
        `;
        this.ctx = null;
        this.chart = null;
        this.data = null;
        this.val = '';
        this.label = '';
        this.labels = '';
        this.xAdjust = null;
    }

    connectedCallback() {
        const timeSeriesChart = this.querySelector('#timeSeriesChartContainer');
        L.DomEvent.disableScrollPropagation(timeSeriesChart);
        L.DomEvent.disableClickPropagation(timeSeriesChart);
        const zoomStart = this.querySelector('#zoom-start');
        const zoomEnd = this.querySelector('#zoom-end');
        const thresholdSetter = this.querySelector('#threshold-setter');
        const labelSetter = this.querySelector('#threshold-label');
        const undoZoom = this.querySelector('#undo-zoom');
        const timeSeries = this.querySelector('#timeSeriesChart');
        this.ctx = timeSeries.getContext('2d');
        timeSeries.addEventListener('pointerdown', (e) => {
            this.zoomBox(e);
        });
        timeSeries.addEventListener('pointerdown', (evt) => {
            const points = this.chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
            if (points.length) {
                const firstPoint = points[0];
                var label = this.chart.data.labels[firstPoint.index];
                var timestamp = localToUTC(label);
                controllers.currentTimestamp.setValue(timestamp);
                setURL();
            }
        });
        thresholdSetter.oninput = () => {
            this.val = thresholdSetter.value;
            this.populateChart(this.data, zoomStart.value, zoomEnd.value);
        }
        labelSetter.oninput = () => {
            this.label = labelSetter.value;
            this.populateChart(this.data, zoomStart.value, zoomEnd.value);
        }
        this.querySelector('#closeTimeSeriesChart').onclick = () => {
            thresholdSetter.value = '';
            labelSetter.value = '';
            this.val = '';
            this.label = '';
            timeSeriesChart.style.display = 'none';
        }
        const zoomChange = () => {
            this.zoomDate();
        }
        zoomStart.onchange = zoomChange;
        zoomEnd.onchange = zoomChange;
        undoZoom.onclick = () => {
            undoZoom.style.display = 'none';
            this.populateChart(this.data);
        }
        this.xAdjust = (document.body.clientWidth < 769) ? 90 : 220;
    }

    zoomDate(startDate = '', endDate = '', yMin = NaN, yMax = NaN) {
        const zoomStart = this.querySelector('#zoom-start');
        const zoomEnd = this.querySelector('#zoom-end');
        const undoZoom = this.querySelector('#undo-zoom');
        if (startDate) {
            zoomStart.value = startDate;
        }
        if (endDate) {
            zoomEnd.value = endDate;
        }
        linkSelects(zoomStart, zoomEnd);
        var startCheck = zoomStart.value == this.labels[0];
        var endCheck = zoomEnd.value == this.labels[this.labels.length - 1];
        var yAxisCheck = isNaN(yMin);
        var undoZoomDisplay = 'block';
        if (startCheck && endCheck && yAxisCheck) {
            undoZoomDisplay = 'none';
        }
        undoZoom.style.display = undoZoomDisplay;
        this.chart.options.scales.xAxes.min = zoomStart.value;
        this.chart.options.scales.xAxes.max = zoomEnd.value;
        delete this.chart.options.scales.yAxes.min;
        delete this.chart.options.scales.yAxes.max;
        if (!isNaN(yMin)) {
            this.chart.options.scales.yAxes.min = yMin;
            this.chart.options.scales.yAxes.max = yMax;
        }
        this.chart.update(this.data);
    }

    populateZoomSelectors(timeStamps, startDate, endDate) {
        if (startDate == '') {
            startDate = timeStamps[0]
        }
        if (endDate == '') {
            endDate = timeStamps[timeStamps.length - 1];
        }
        const zoomStart = this.querySelector('#zoom-start');
        const zoomEnd = this.querySelector('#zoom-end');
        zoomStart.innerHTML = '';
        zoomEnd.innerHTML = '';
        for (var timeStamp of timeStamps) {
            zoomStart.appendChild(createOption(timeStamp, false));
            zoomEnd.appendChild(createOption(timeStamp, false));
        }
        zoomStart.value = startDate;
        zoomEnd.value = endDate;
        linkSelects(zoomStart, zoomEnd);
    }

    populateChart(data, startDate='', endDate='') {
        if (data.length == 0) {
            return;
        }
        this.data = data;
        var labels = Object.keys(data[0].dataset).map(timeStamp => {
            return utcToLocal(timeStamp);
        });
        this.labels = labels;
        this.populateZoomSelectors(labels, startDate, endDate);
        if (this.chart) {
            this.chart.destroy();
        }
        const roundLatLon = (num) => Math.round(num*100) / 100;
        var dataset = [];
        const complementColor = (rgb) => {
            var complement = [];
            for (var colorValue of rgb) {
                var upper = (colorValue + 255) / 2;
                var lower = colorValue / 2;
                if ((upper - colorValue) > (colorValue - lower)) {
                    complement.push(upper);
                } else {
                    complement.push(lower);
                }
            }
            return `rgb(${complement[0]}, ${complement[1]}, ${complement[2]})`;
        };
        for (var timeSeriesDataset of data) {
            let rgb = timeSeriesDataset.rgb; // use let here to create block scope
            let color = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;  
            var timeSeriesData = {
                    label: timeSeriesDataset.label + ' values at lat: ' + roundLatLon(timeSeriesDataset.latLon.lat) + ' lon: ' + roundLatLon(timeSeriesDataset.latLon.lng),
                    fill: false,
                    data: Object.entries(timeSeriesDataset.dataset).map(entry => entry[1]),
                    borderColor: color, 
                    backgroundColor: color,
                    pointBackgroundColor: (context) => {
                        var index = context.dataIndex;
                        var value = context.dataset.data[index];
                        if (this.val === '' || isNaN(this.val) || value > this.val) {
                            return color;
                        }
                        return complementColor(rgb);
                    },
                    lineTension: 0,
                    borderWidth: 1,
            }
            dataset.push(timeSeriesData);
        }
        var xAxisOptions = {
            title: {
                display: true,
                text: 'Timestamp'
            }
        };
        if (startDate) {
            xAxisOptions.min = startDate;
        }
        if (endDate) {
            xAxisOptions.max = endDate;
        }
        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: dataset
            },
            options: {
                animation: {
                    duration: 0
                },
                scales: {
                    yAxes: {
                        title: {
                            display: true,
                            text: simVars.displayedColorbar
                        }
                    },
                    xAxes: xAxisOptions
                },
                plugins: {
                    annotation: {
                        annotations: [{
                            display: this.val !== '' && !isNaN(this.val),
                            type: 'line',
                            mode: 'horizontal',
                            scaleID: 'yAxes',
                            value: this.val,
                            borderColor: 'rgb(255, 99, 132)',
                            borderWidth: 2,
                            label: {
                                enabled: this.label != '',
                                content: this.label,
                                xAdjust: this.xAdjust - 2*this.label.length
                            }
                        }]
                      }
                },
            }
        });
        this.querySelector('#timeSeriesChartContainer').style.display = 'block';
    }

    zoomBox(e) {
        // get the mouse cursor position at startup:
        e = e || window.event;
        e.stopPropagation();
        e.preventDefault();
        var [zoomLeft, zoomRight, zoomTop, zoomBottom] = [e.clientX, e.clientX, e.clientY, e.clientY];
        // position the drawn box
        const zoomBoxArea = this.querySelector('#zoomBox');
        zoomBoxArea.style.width = '0px';
        zoomBoxArea.style.height = '0px';
        zoomBoxArea.style.display = 'block';
        zoomBoxArea.style.left = e.clientX + 'px';
        zoomBoxArea.style.top = e.clientY + 'px';
        // get the bounds of the chart to ensure we don't overdraw
        const canvas = this.querySelector('#timeSeriesChart');
        var boundingRect = canvas.getBoundingClientRect();
        // get the data of each point on the chart
        var dataset = [];
        for (var i = 0; i < this.data.length; i++) {
            dataset.push(this.chart.getDatasetMeta(i).data);
        }

        document.onpointerup = () => {
            document.onpointerup = null;
            document.onpointermove = null;

            zoomBoxArea.style.display = 'none';
            // get the index and y value of each data point that is inside the drawn box
            var zoomData = dataset.map(data => data.filter(datapoint => {
                var xCheck = datapoint.x >= zoomLeft - boundingRect.left && datapoint.x <= zoomRight - boundingRect.left;
                var yCheck = datapoint.y >= zoomTop - boundingRect.top && datapoint.y <= zoomBottom - boundingRect.top;
                return xCheck && yCheck;
            }).map(datapoint => {
                return [datapoint.parsed.x, datapoint.parsed.y];
            }));
            var labelIndices = zoomData.map(dataset => dataset.map(data => data[0]));
            var yValues = zoomData.map(dataset => dataset.map(data => data[1]));
            // get the min/max indices and values to set the bound of the chart
            const minValue = (values) => Math.min(...values.map(dataValues => Math.min(...dataValues)));
            const maxValue = (values) => Math.max(...values.map(dataValues => Math.max(...dataValues)));
            var [minIndex, maxIndex, yMin, yMax] = [minValue(labelIndices), maxValue(labelIndices), minValue(yValues), maxValue(yValues)];
            // if there are selected points zoom the chart to them
            if (yMax > -Infinity) {
                minIndex = Math.max(0, minIndex - 1);
                maxIndex = Math.min(maxIndex + 1, this.labels.length - 1);
                yMin = yMin - .01*yMin;
                yMax = yMax + .01*yMax;
                this.zoomDate(this.labels[minIndex], this.labels[maxIndex], yMin, yMax);
                this.chart.update(this.data);
            }
        };
        // call a function whenever the cursor moves: draws a zoombox
        document.onpointermove = (e2) => {
            e2 = e2 || window.event;
            e2.preventDefault();
            e2.stopPropagation();
            // calculate the new cursor position:
            if (e2.clientX > boundingRect.right || e2.clientY > boundingRect.bottom) {
                return;
            }
            let xDiff = e2.clientX - zoomLeft;
            let yDiff = e2.clientY - zoomTop;
            zoomRight = zoomLeft + xDiff;
            zoomBottom = zoomTop + yDiff;
            zoomBoxArea.style.width = xDiff + 'px';
            zoomBoxArea.style.height = yDiff + 'px';
        }
    }
}

window.customElements.define('timeseries-chart', TimeSeriesChart);