const {CatalogMenu} = require('../components/CatalogMenu/catalogMenu');
const services = require('../services.js');

const {L} = require("../leaflet/leaflet.js");
jest.mock("../leaflet/leaflet.js");

const {CatalogItem} = require('../components/CatalogMenu/catalogItem');
jest.mock('../components/CatalogMenu/catalogItem')

const catalogItemConstructor = (catEntry) => {
    const span = document.createElement('span');
    span.innerHTML = catEntry.description;
    return span;
}
CatalogItem.mockImplementation((catEntry, navJobId) => catalogItemConstructor(catEntry));

describe('fetching data for catalogMenu', () => {
    var catalogMenu;
    beforeEach(async () => {
        jest.spyOn(services, 'getCatalogEntries');
        services.getCatalogEntries.mockImplementation(() => {
            return {1: {job_id: 1, description: "mocked Fire 1"}, 
                    2: {job_id: 2, description: "mocked Fire 2"}, 
                    3: {job_id: 3, description: "mocked GACC"}, 
                    4: {job_id: 4, description: "mocked SAT"}};
        });

        catalogMenu = await document.body.appendChild(new CatalogMenu());
        return catalogMenu;
    });

    test('List of Fire simulations is built properly', () => {
        const firesList = catalogMenu.firesList;
        expect(firesList.length).toEqual(2);
        expect(firesList[0].job_id).toEqual(1);
    });

    test('List of GACC simulations is built properly', () => {
        const fuelMoistureList = catalogMenu.fuelMoistureList;
        expect(fuelMoistureList.length).toEqual(1);
        expect(fuelMoistureList[0].job_id).toEqual(3);
    });

    test('List of SAT simulations is built properly', () => {
        const satelliteList = catalogMenu.satelliteList;
        expect(satelliteList.length).toEqual(1);
        expect(satelliteList[0].job_id).toEqual(4);
    });

    test('DOM should render Fire simulation in FireList', () => {
        const firesDOM = document.querySelector('#catalog-fires');
        expect(firesDOM.innerHTML).toContain('Fire 1');
        expect(firesDOM.innerHTML).toContain('Fire 2');
        expect(firesDOM.innerHTML).not.toContain('GACC');
        expect(firesDOM.innerHTML).not.toContain('SAT');
    });

    test('DOM should render GACC simulation in Moisture Column', () => {
        const fuelMoistureDOM = document.querySelector('#catalog-fuel-moisture');
        expect(fuelMoistureDOM.innerHTML).toContain('GACC');
        expect(fuelMoistureDOM.innerHTML).not.toContain('Fire');
        expect(fuelMoistureDOM.innerHTML).not.toContain('SAT');
    });

    test('DOM should render SAT simulation in SAT Column', () => {
        const satDOM = document.querySelector('#catalog-satellite-data');
        expect(satDOM.innerHTML).toContain('SAT');
        expect(satDOM.innerHTML).not.toContain('Fire');
        expect(satDOM.innerHTML).not.toContain('GACC');
    });
});

describe('sorting fetched data', () => {
    var catalogMenu;

    beforeEach(async () => {
        jest.spyOn(services, 'getCatalogEntries');
        services.getCatalogEntries.mockImplementation(() => {
            return {1: {job_id: 1, description: "mocked Fire 2"}, 
                    2: {job_id: 2, description: "mocked Fire 1"}, 
                    3: {job_id: 3, description: "mocked GACC 1", from_utc: "2020"}, 
                    4: {job_id: 4, description: "mocked GACC 2", from_utc: "2019"}, 
                    5: {job_id: 5, description: "mocked SAT 1", to_utc: "2020"},
                    6: {job_id: 6, description: "mocked SAT 2", to_utc: "2019"}};
        });
        catalogMenu = await document.body.appendChild(new CatalogMenu());
        return catalogMenu;
    });
    
    test('DOM should support sort by description', () => {
        // catalogMenu.sortBy("description", false);
        // const firesDOM = document.querySelector('#catalog-fires');
        // let correctOrder = firesDOM.innerHTML.indexOf("mocked Fire 1") < firesDOM.innerHTML.indexOf("mocked Fire 2");
        // expect(correctOrder).toBe(true);
    });

    test('DOM should support sort by start date', () => {
        console.log(catalogMenu.innerHTML);
        catalogMenu.sortBy("start-date", false);
        const fuelMoistureDOM = document.querySelector('#fuel-moisture-column');
        console.log(fuelMoistureDOM.innerHTML);
        let correctOrder = catalogMenu.innerHTML.indexOf("mocked GACC 2") < catalogMenu.innerHTML.indexOf("mocked GACC 1");
        expect(correctOrder).toBe(true);
    });
});