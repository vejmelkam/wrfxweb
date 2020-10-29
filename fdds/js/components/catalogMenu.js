class CatalogMenu extends HTMLElement {
    constructor() {
        super();
        this.innerHTML = `
            <div id="select-dialog" title="Select simulation ...">
                <div class="ui three column grid">
                    <div class="column">
                            <h3>Fires</h3>
                            <ul id="catalog-list-1" class="catalog-list"> </ul>
                    </div>
                    <div class="column">
                            <h3>Fuel moisture</h3>
                            <ul id="catalog-list-2" class="catalog-list"> </ul>
                    </div>
                    <div class="column">
                            <h3>Satellite Data</h3>
                            <ul id="catalog-list-3" class="catalog-list"> </ul>
                    </div>
                    </div>
                </div>
            </div>
        `;
    }

    connectedCallback() {
        $.when(
            $.getJSON("simulations/catalog.json", function(data) {
                catalog = data;
                var list1 = $('#catalog-list-1');
                var list2 = $('#catalog-list-2');
                var list3 = $('#catalog-list-3');
                $.each(data, function(cat_name) {
                var cat_entry = data[cat_name];
                var desc = cat_entry.description;
                var from = cat_entry.from_utc;
                var to = cat_entry.to_utc;
                var job_id = cat_entry.job_id;
                var kml_url = cat_entry.kml_url;
                var kml_size = cat_entry.kml_size;
                var zip_url = cat_entry.zip_url;
                var zip_size = cat_entry.zip_size;
                var load_cmd = '"handle_catalog_click(\'simulations/' + cat_entry.manifest_path + '\');"';
                var html = '<li class="catalog-entry" onclick=' + load_cmd + '><b>' 
                            + desc + '</b><br/>' 
                                                    + 'from: ' + from + '<br/>to: ' + to  + '<br/>';
                if(job_id) {
                    html = html  + 'job id: ' + job_id + '<br/>';
                }
                html = html + '</li>';
                if(kml_url) {
                    var mb = Math.round(10*kml_size/1048576.0)/10;
                    html = html + '<a href="' + kml_url + '" download>Download KMZ ' + mb.toString() +' MB</a><br/>' ;
                }
                if(zip_url) {
                    var mb = Math.round(10*zip_size/1048576.0)/10;
                    html = html + '<a href="' + zip_url + '" download>Download ZIP ' + mb.toString() +' MB</a><br/>' ;
                }

                if(desc.indexOf('GACC') >= 0) {
                    list2.append(html);
                } else if(desc.indexOf('SAT') >= 0) {
                    list3.append(html);
                } else {
                    list1.append(html);
                }
            });
        })).then(function() {
            $('#select-dialog').dialog({ autoOpen: false });
            var simid_ndx = window.location.hash.indexOf('sim_id');
            var simid = window.location.hash.substring(simid_ndx+7);
            if(simid_ndx >= 0 && simid in catalog) {
                handle_catalog_click('simulations/' + catalog[simid].manifest_path);
            } else {
                open_catalog();
            }
        });
    }
}

window.customElements.define('catalog-menu', CatalogMenu);