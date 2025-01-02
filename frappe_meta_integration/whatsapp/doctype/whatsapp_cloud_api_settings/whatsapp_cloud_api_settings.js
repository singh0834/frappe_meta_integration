// Copyright (c) 2022, efeone Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('WhatsApp Cloud API Settings', {
	refresh: function(frm) {
    if(frm.doc.access_token && frm.doc.phone_number_id){
			frm.add_custom_button('Verify Token', () => {
		    set_primary_action(frm);
		  }).addClass("btn-primary");
    }
		frm.set_query('welcome_message_template', () => {
        return {
            filters: {
                docstatus: 1,
								parameter_count: 1
            }
        }
    })
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

function set_primary_action(frm){
  frappe.prompt({
      label: 'WhatsApp Number',
      fieldname: 'phone_number',
      fieldtype: 'Data',
      description: 'WhatsApp number with country code(eg: 91)',
      reqd: 1
  }, (values) => {
      send_verify_message(frm, values.phone_number)
  })
}

function send_verify_message(frm, phone_number){
  frappe.call({
    method: 'frappe_meta_integration.whatsapp.doctype.whatsapp_cloud_api_settings.whatsapp_cloud_api_settings.send_test_message',
    args: {
      "phone_number": phone_number
    },
    callback: function(r) {
      if(r && r.message){
        frappe.msgprint({
            title: __('Success'),
            message: __("WhatsApp Account successfully configured. <br> Message ID : {0}",[r.message])
        });
      }
    },
    freeze: true,
    freeze_message: ('Sending WhatsApp test Message.!!')
  });
}
