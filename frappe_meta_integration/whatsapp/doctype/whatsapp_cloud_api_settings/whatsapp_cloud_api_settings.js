// Copyright (c) 2022, efeone Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('WhatsApp Cloud API Settings', {
	refresh: function(frm) {
    fetch_template(frm)
	}

});

function fetch_template(frm){
  frm.add_custom_button(__('Fetch Templates'), function () {
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
  });
}
