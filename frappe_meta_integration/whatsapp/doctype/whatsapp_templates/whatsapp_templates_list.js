// Copyright (c) 2018, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

frappe.listview_settings["WhatsApp Templates"] = {
    onload:function(listview){
        listview.page.add_inner_button("Fetch Templates", function() {
            frappe.show_progress('Fetching WhatsApp Templates...', 70, 100, 'Please wait');
            frappe.call({
                method: "frappe_meta_integration.whatsapp.api.whatsapp_api.get_message_templates",
                callback: function (r) {
                    if(r.message[0] == true){
                        frappe.hide_progress("Fetching WhatsApp Templates...")
                        frappe.msgprint({
                            title: __('Success'),
                            indicator: 'green',
                            message: __(r.message[1])
                        });
                        frappe.ui.toolbar.clear_cache()
                    }else if(r.message[0] == false){
                        frappe.hide_progress("Fetching WhatsApp Templates...")
                        frappe.msgprint({
                            title: __('Failure'),
                            indicator: 'red',
                            message: __(r.message[1])
                        });
                    }
                }
            })
        })
    }
};
