frappe.provide('frappe.ui.form');
frappe.provide('frappe.model.docinfo');
frappe.provide("frappe.views")

$(document).ready(function (){
	frappe.ui.form.Controller = Class.extend({
		init: function(opts) {
			$.extend(this, opts);
			let ignored_doctype_list = ["DocType", "Customize Form"]
			frappe.ui.form.on(this.frm.doctype, {
				refresh(frm) {
					if(!ignored_doctype_list.includes(frm.doc.doctype)){
						frm.page.add_menu_item(__('Send via WhatsApp1'), function() { send_sms(frm); });
					}
				}
			});
		}
	});
});



frappe.views.WhatsAppComposer = class {
	constructor(opts) {
		$.extend(this, opts);
		if (!this.doc) {
			this.doc = this.frm && this.frm.doc || {};
		}
		this.make();
	}

	make() {
		send_sms(cur_frm)
	}
}
function send_sms(frm){
	if(frm.is_dirty()){
		frappe.throw(__('You have unsaved changes. Save before send.'))
	}
	else {
		create_recipients_dailog(frm);
	}
}

function create_recipients_dailog(frm){

	let counter = 0
	let context = {}
	let contact_dict = {};
	let contact_list = [];
	let contacts = [];
	cur_frm.meta.fields.forEach((e) => { if (e.options == "Phone") { contact_dict[e.fieldname] = e.label } })
	let doc_field_list = [{
		"value": "Attachment",
		"description": "Attach a file"
	}]
	if (frappe.model.can_print(null, cur_frm) && !cur_frm.meta.issingle) {
		doc_field_list.push({
			"value": "Print Format",
			"description": "Print Format"
		})
	}
	let data_link_dict = {}
	cur_frm.meta.fields.forEach((e) => { if (e.fieldtype == "Data" || e.fieldtype == "Link") { data_link_dict[e.fieldname] = e.label } })

	for (const [key, value] of Object.entries(cur_frm.doc)) {
		if (key in data_link_dict && value.replaceAll(" ", "") != "") {
			doc_field_list.push({
				"value": value,
				"description": data_link_dict[key]
			})
		}
		if (key in contact_dict && value.replaceAll(" ", "") != "") {
			if(!contacts.includes(value)){
				contacts.push(value)
				contact_list.push({
					"value": value,
					"description": contact_dict[key]
				})
			}
		}
	}
	console.log(contact_list)
	let d = new frappe.ui.Dialog({
    title: frm.doc.doctype + " : " + frm.doc.name,
    fields: [
			{
				label: __("To"),
				fieldtype: "MultiSelect",
				reqd: 1,
				fieldname: "recipients",
				options: contact_list,
				description: "<strong>Note</strong>: Please enter contact with Country Code"
			},
			{
				label: __("WhatsApp Template"),
				fieldtype: "Link",
				reqd: 1,
				fieldname: "whatsapp_template",
				options: "WhatsApp Message MSG91",
				"get_query": function () {
					return {
						filters: {
							"enabled": 1
						}
					}
				},
				onchange: function (e) {
					var whatsapp_template = d.get_field("whatsapp_template");
					var content = d.get_field("content");
					whatsapp_template.refresh()
					content.refresh()
					if(this.value){
						console.log(this.value)
						frappe.db.get_doc("WhatsApp Message MSG91", this.value)
						.then((data) => {
							counter += 1
							if (counter == 1) {
								// cur_frm.broadcast_name = data.broadcast_name
								let elements = document.getElementsByClassName("modal-body ui-front");
								Array.from(elements).forEach((e) => { e.addEventListener("click", function () { verify(cur_frm.dialog_d, cur_frm.dialog_context, cur_frm.dialog_data, cur_frm.dialog_header_html, cur_frm.data_dict); }); })
								cur_frm.fields_list = data.whatsapp_map
								let option_list = ["Attachment"]
								if (frappe.model.can_print(null, cur_frm) && !cur_frm.meta.issingle) {
									option_list.push("Print Format")
								}
								console.log(data.whatsapp_map)
								data.parameter.forEach((e) => {
									if (e.location == "header") {
										d.make_field({
											"fieldtype": "Select",
											"label": e.field_name,
											"fieldname": e.field_name,
											"options": option_list,
											"reqd": 1
										})
									}
									else{
										console.log(e.field_name,"field_name")
										d.make_field({
											"fieldtype": "MultiSelect",
											"label": e.field_name,
											"fieldname": e.field_name,
											"reqd": 1
										})
									}
									d.make_field({
										"label": __("Attachment"),
										"fieldtype": "Attach",
										"fieldname": e.field_name + "_attachment",
										"hidden": true
									})
									d.get_field(e.field_name + "_attachment").refresh()
									// make print_format field for every field
									d.make_field({
										"label": __("Select Print Format"),
										"fieldtype": "Select",
										"fieldname": e.field_name + "_print_format",
										"options": frappe.meta.get_print_formats(cur_frm.meta.name),
										"hidden": true
									});
									d.get_field(e.field_name + "_print_format").refresh()
									d.get_field(e.field_name).refresh();
									context[e.field_name] = "";
									if (e.location != "header") {
										console.log(doc_field_list,"doc_field_list")
										d.get_field(e.field_name).set_data(doc_field_list)
									}
                                    // console.log(d.fields_dict[e.field_name].input)
									d.fields_dict[e.field_name].input.onchange = function () {
										if (this.value && this.value.replace(", ", "") == "Attachment") {
											d.get_field(e.field_name + "_attachment").df.hidden = false
											d.get_field(e.field_name + "_attachment").value = ""
											d.get_field(e.field_name + "_attachment").refresh()

											d.get_field(e.field_name + "_print_format").df.hidden = true
											d.get_field(e.field_name + "_print_format").refresh()
											cur_frm.dialog_context[e.field_name] = ""
										}
										else if (this.value && this.value.replace(", ", "") == "Print Format") {
											d.get_field(e.field_name + "_attachment").df.hidden = true
											d.get_field(e.field_name + "_attachment").refresh()

											d.get_field(e.field_name + "_print_format").df.hidden = false
											d.get_field(e.field_name + "_print_format").refresh()
											cur_frm.dialog_context[e.field_name] = ""
										} else {
											d.get_field(e.field_name + "_attachment").df.hidden = true
											d.get_field(e.field_name + "_attachment").refresh()

											d.get_field(e.field_name + "_print_format").df.hidden = true
											d.get_field(e.field_name + "_print_format").refresh()
										}

										verify(cur_frm.dialog_d, cur_frm.dialog_context, cur_frm.dialog_data, cur_frm.dialog_header_html)

									}
								})
								let header_html = "";
								if (!["TEXT", "", undefined, null].includes(data.header_type)) {
									header_html = data.header_type.charAt(0).toUpperCase() + data.header_type.slice(1) + ` Attachment: <a href="` + data.header_image + `">` + data.header_image + `</a><br><br>`
								}
								$(d.get_field('content').wrapper).html(
									`<div class="card mb-3 h-100"><div class="card-body">`  + data.template + `<br><br></div></div>`
								);
								cur_frm.dialog_d = d
								cur_frm.dialog_context = context
								cur_frm.dialog_data = data
								cur_frm.dialog_header_html = header_html
							}
						})
					}
				}
			},
			{ 'label': __("Content"), 'fieldname': 'content', 'fieldtype': 'HTML' },
			
		],
		primary_action_label: __("Send"),
		primary_action(values) {
			dialog_primary_action(frm, values)
			d.hide();
		},
		secondary_action_label: __("Discard"),
		secondary_action() {
			d.hide();
		},
		size: 'large',
		minimizable: true
	});
	d.show();
	// get_whatsapp_number_list(d)
}

function get_whatsapp_number_list(d){
	d.fields_dict["recipients"].get_data = () => {
		const data = d.fields_dict["recipients"].get_value();
		const txt = data.match(/[^,\s*]*$/)[0] || '';
		console.log(txt)
		frappe.call({
			method: "frappe_meta_integration.whatsapp.utils.get_contact_list",
			args: {txt},
			callback: (r) => {
				d.fields_dict["recipients"].set_data(r.message);
			}
		});
	};
}

function dialog_primary_action(frm, values){
	frappe.call({
		method: "frappe_meta_integration.whatsapp.utils.send_whatsapp_msg",
		args: {
      "doctype": frm.doc.doctype,
			"docname": frm.doc.name,
			"args": values
    },
		freeze: true,
    freeze_message: ('Sending WhatsApp Message.!!')
	});
}

function verify(d, context, data, header_html) {
	console.log(d, "-->dddd", context, "--->context", data, "--->data", header_html, "--->header_htm")
	for (const [key, value] of Object.entries(context)) {
		if ((d.get_field(key).input.value).replace(", ", "") == "Attachment") {
			if (d.get_field(key + "_attachment").value == null || d.get_field(key + "_attachment").value.length == 0) {
				return
			}
			else if(d.get_field(key + "_attachment").value && d.get_field(key + "_attachment").value.includes("/private/")){
				d.get_field(key + "_attachment").value = ""
				d.get_field(key + "_attachment").refresh()
				frappe.msgprint("Attachment File can't be Private")
			}
			else if (d.get_field(key + "_attachment").value && d.get_field(key + "_attachment").value.includes("https://")) {
				context[key] = (d.get_field(key + "_attachment").value)
			} else {
				context[key] = ("https://" + frappe.boot.sitename + d.get_field(key + "_attachment").value)
			}
		} else if ((d.get_field(key).input.value).replace(", ", "") == "Print Format") {
			frappe.call({
				method: "journeys.users.get_attach_link",
				args: { "doc": { "doctype": cur_frm.doc.doctype, "docname": cur_frm.doc.name }, "print_format": d.get_field(key + "_print_format").value },
				callback: (r) => {
					context[key] = r.message
				}
			})
		} else {
			context[key] = (d.get_field(key).input.value).replace(", ", "");
		}
	}
	$(d.get_field('content').wrapper).html(
		`<div class="card mb-3 h-100"><div class="card-body">` +  frappe.render(data.template, context) + `<br><br></div></div>`
	);
	d.get_primary_btn()[0].disabled = false
}

// frappe.provide('frappe.ui.form');
// frappe.provide('frappe.model.docinfo');
// frappe.provide('frappe.views');

// $(document).ready(function () {
//     frappe.ui.form.Controller = Class.extend({
//         init: function (opts) {
//             $.extend(this, opts);
//             let ignored_doctype_list = ["DocType", "Customize Form"];
//             frappe.ui.form.on(this.frm.doctype, {
//                 refresh(frm) {
//                     if (!ignored_doctype_list.includes(frm.doc.doctype)) {
//                         frm.page.add_menu_item(__('Send via WhatsApp'), function () {
//                             send_sms(frm);
//                         });
//                     }
//                 }
//             });
//         }
//     });
// });

// frappe.views.WhatsAppComposer = class {
//     constructor(opts) {
//         $.extend(this, opts);
//         this.doc = this.frm && this.frm.doc || {};
//         this.make();
//     }

//     make() {
//         send_sms(this.frm);
//     }
// }

// function send_sms(frm) {
//     if (frm.is_dirty()) {
//         frappe.throw(__('You have unsaved changes. Save before sending.'));
//     } else {
//         create_recipients_dialog(frm);
//     }
// }

// function create_recipients_dialog(frm) {
//     const contact_list = get_contacts(frm);
//     const doc_field_list = get_doc_field_list(frm);

//     const d = new frappe.ui.Dialog({
//         title: `${frm.doc.doctype} : ${frm.doc.name}`,
//         fields: [
//             {
//                 label: __("To"),
//                 fieldtype: "MultiSelect",
//                 reqd: 1,
//                 fieldname: "recipients",
//                 options: contact_list,
//                 description: "<strong>Note</strong>: Please enter contact with Country Code"
//             },
//             {
//                 label: __("WhatsApp Template"),
//                 fieldtype: "Link",
//                 reqd: 1,
//                 fieldname: "whatsapp_template",
//                 options: "WhatsApp Message MSG91",
//                 get_query: function () {
//                     return {
//                         filters: {
//                             "enabled": 1
//                         }
//                     }
//                 },
//                 onchange: function () {
//                     const whatsapp_template = d.get_field("whatsapp_template");
//                     const content = d.get_field("content");
//                     refresh_template_content(d, whatsapp_template, content);
//                 }
//             },
//             { 'label': __("Content"), 'fieldname': 'content', 'fieldtype': 'HTML' },
//         ],
//         primary_action_label: __("Send"),
//         primary_action(values) {
//             dialog_primary_action(frm, values);
//             d.hide();
//         },
//         secondary_action_label: __("Discard"),
//         secondary_action() {
//             d.hide();
//         },
//         size: 'large',
//         minimizable: true
//     });

//     d.show();
// }

// function get_contacts(frm) {
//     let contact_dict = {};
//     let contact_list = [];
//     let contacts = [];
//     frm.meta.fields.forEach(e => {
//         if (e.options === "Phone") {
//             contact_dict[e.fieldname] = e.label;
//         }
//     });

//     Object.entries(frm.doc).forEach(([key, value]) => {
//         if (contact_dict[key] && value.trim() !== "") {
//             if (!contacts.includes(value)) {
//                 contacts.push(value);
//                 contact_list.push({
//                     "value": value,
//                     "description": contact_dict[key]
//                 });
//             }
//         }
//     });

//     return contact_list;
// }

// function get_doc_field_list(frm) {
//     let doc_field_list = [{ "value": "Attachment", "description": "Attach a file" }];
//     if (frappe.model.can_print(null, frm) && !frm.meta.issingle) {
//         doc_field_list.push({ "value": "Print Format", "description": "Print Format" });
//     }

//     let data_link_dict = {};
//     frm.meta.fields.forEach(e => {
//         if (e.fieldtype === "Data" || e.fieldtype === "Link") {
//             data_link_dict[e.fieldname] = e.label;
//         }
//     });

//     Object.entries(frm.doc).forEach(([key, value]) => {
//         if (data_link_dict[key] && value.trim() !== "") {
//             doc_field_list.push({ "value": value, "description": data_link_dict[key] });
//         }
//     });

//     return doc_field_list;
// }

// function refresh_template_content(d, whatsapp_template, content) {
//     if (whatsapp_template.value) {
//         frappe.db.get_doc("WhatsApp Message MSG91", whatsapp_template.value)
//             .then((data) => {
//                 const context = {};
//                 const option_list = ["Attachment"];
//                 if (frappe.model.can_print(null, cur_frm) && !cur_frm.meta.issingle) {
//                     option_list.push("Print Format");
//                 }

//                 data.parameter.forEach(e => {
//                     add_dynamic_fields(d, e, option_list);
//                     context[e.field_name] = "";
//                 });

//                 update_content(d, data, context);
//             })
//             .catch((err) => {
//                 frappe.msgprint(__('Error loading template: ') + err.message);
//             });
//     }
// }

// function add_dynamic_fields(d, e, option_list) {
//     // Create the dynamic fields (Select, MultiSelect, etc.)
//     d.make_field({
//         "fieldtype": e.location === "header" ? "Select" : "MultiSelect",
//         "label": e.field_name,
//         "fieldname": e.field_name,
//         "options": option_list,
//         "reqd": 1
//     });

//     // Attach field for file and print format
//     d.make_field({
//         "label": __("Attachment"),
//         "fieldtype": "Attach",
//         "fieldname": e.field_name + "_attachment",
//         "hidden": true
//     });

//     d.make_field({
//         "label": __("Select Print Format"),
//         "fieldtype": "Select",
//         "fieldname": e.field_name + "_print_format",
//         "options": frappe.meta.get_print_formats(cur_frm.meta.name),
//         "hidden": true
//     });

//     // Refresh fields
//     d.get_field(e.field_name + "_attachment").refresh();
//     d.get_field(e.field_name + "_print_format").refresh();
//     d.get_field(e.field_name).refresh();
// }

// function update_content(d, data, context) {
//     let header_html = "";
//     if (data.header_type && !["TEXT", "", undefined, null].includes(data.header_type)) {
//         header_html = `<strong>${data.header_type.charAt(0).toUpperCase() + data.header_type.slice(1)}:</strong><br><a href="${data.header_image}">Attachment</a><br><br>`;
//     }

//     $(d.get_field('content').wrapper).html(`
//         <div class="card mb-3 h-100">
//             <div class="card-body">
//                 ${header_html}${data.message_body}
//             </div>
//         </div>
//     `);
// }

// function dialog_primary_action(frm, values) {
//     frappe.call({
//         method: "frappe_meta_integration.whatsapp.utils.send_whatsapp_msg",
//         args: {
//             "doctype": frm.doc.doctype,
//             "docname": frm.doc.name,
//             "args": values
//         },
//         freeze: true,
//         freeze_message: __('Sending WhatsApp Message...'),
//     });
// }

// function verify(d, context, data, header_html) {
//     for (const [key, value] of Object.entries(context)) {
//         const field = d.get_field(key);
//         const value = field.input.value.replace(", ", "");
//         if (value === "Attachment") {
//             handle_attachment(d, context, key);
//         } else if (value === "Print Format") {
//             handle_print_format(d, context, key);
//         } else {
//             context[key] = value;
//         }
//     }

//     update_content(d, data, context);
// }

// function handle_attachment(d, context, key) {
//     const attachment = d.get_field(key + "_attachment");
//     if (!attachment.value) {
//         return;
//     } else if (attachment.value.includes("/private/")) {
//         attachment.value = "";
//         attachment.refresh();
//         frappe.msgprint("Attachment File can't be Private");
//     } else {
//         context[key] = attachment.value.includes("https://") ? attachment.value : `https://${frappe.boot.sitename}${attachment.value}`;
//     }
// }

// function handle_print_format(d, context, key) {
//     const print_format = d.get_field(key + "_print_format").value;
//     frappe.call({
//         method: "journeys.users.get_attach_link",
//         args: {
//             "doc": { "doctype": cur_frm.doc.doctype, "docname": cur_frm.doc.name },
//             "print_format": print_format
//         },
//         callback: (r) => {
//             context[key] = r.message;
//         }
//     });
// }
