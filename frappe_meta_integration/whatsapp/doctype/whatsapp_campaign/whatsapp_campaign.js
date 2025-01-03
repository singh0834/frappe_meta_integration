// Copyright (c) 2023, efeone Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('WhatsApp Campaign', {
  setup: function(frm){
    frm.get_field("parameters").grid.cannot_add_rows = true;
    frm.refresh_field("parameters");
    // frm.set_query('whatsapp_message_template', () => {
    //     return {
    //         filters: {
    //             docstatus: 1
    //         }
    //     }
    // });
  },
  refresh:function(frm){
    frm.add_custom_button(
      __("Schedule sending"),
      () => {
        frm.events.schedule_send_dialog(frm);
      },
      __("Send")
    );
  },
  schedule_send_dialog(frm) {
		let hours = frappe.utils.range(24);
		let time_slots = hours.map((hour) => {
			return `${(hour + "").padStart(2, "0")}:00`;
		});
		let d = new frappe.ui.Dialog({
			title: __("Schedule WhatsApp"),
			fields: [
				{
					label: __("Date"),
					fieldname: "date",
					fieldtype: "Date",
					options: {
						minDate: new Date(),
					},
					reqd: true,
				},
				{
					label: __("Time"),
					fieldname: "time",
					fieldtype: "Select",
					options: time_slots,
					reqd: true,
				},
			],
			primary_action_label: __("Schedule"),
			primary_action({ date, time }) {
				frm.set_value("schedule_sending", 1);
				frm.set_value("schedule_send", `${date} ${time}:00`);
				d.hide();
				frm.save();
			},
			secondary_action_label: __("Cancel Scheduling"),
			secondary_action() {
				frm.set_value("schedule_sending", 0);
				frm.set_value("schedule_send", "");
				d.hide();
				frm.save();
			},
		});
		if (frm.doc.schedule_sending) {
			let parts = frm.doc.schedule_send.split(" ");
			if (parts.length === 2) {
				let [date, time] = parts;
				d.set_value("date", date);
				d.set_value("time", time.slice(0, 5));
			}
		}
		d.show();
	},
  whatsapp_message_template: function(frm){
    set_template_parameters(frm);
  }
});

frappe.ui.form.on('WhatsApp Message Template Item', {
  parameters_remove: function(frm, cdt, cdn){
    frappe.show_alert({
      message:__('You are not allowed to add/remove parameter Manually!. Changes will be reverted.'),
      indicator:'red'
    }, 5);
    set_template_parameters(frm);
  },
  parameters_add: function(frm, cdt, cdn){
    frappe.show_alert({
      message:__('You are not allowed to add/remove parameter Manually!. Changes will be reverted.'),
      indicator:'red'
    }, 5);
    set_template_parameters(frm);
  }
});

function set_template_parameters(frm){
  if(frm.doc.whatsapp_message_template){
    frappe.call({
      method: 'frappe_meta_integration.whatsapp.doctype.whatsapp_message_template.whatsapp_message_template.set_template_parameters',
      args: {
        "whatsapp_message_template": frm.doc.whatsapp_message_template
      },
      callback: function(r) {
        console.log(r)
        frm.clear_table('parameters');
        for(var i=0; i< r.message.length; i++){
          let row =frm.add_child('parameters',{
            parameter: r.message[i].field_name,
            location: r.message[i].location,
            type: r.message[i].type,
            subtype: r.message[i].subtype,
          });
        }
        frm.save()
      }
    });
  }
}

//updated code - sukhman
frappe.ui.form.on('WhatsApp Campaign', {
  refresh: function(frm) {
      frm.trigger('setup_filters');
      
      // Add styles
      if (!document.getElementById('whatsapp-campaign-styles')) {
          const styleSheet = document.createElement('style');
          styleSheet.id = 'whatsapp-campaign-styles';
          styleSheet.textContent = `
              .filter-section {
                  margin: 15px 0;
                  padding: 15px;
                  border: 1px solid #d1d8dd;
                  border-radius: 4px;
                  background-color: #f7fafc;
              }

              .filter-area {
                  margin-bottom: 15px;
              }

              .filter-toolbar {
                  display: flex;
                  justify-content: flex-end;
                  padding-top: 10px;
                  border-top: 1px solid #ebeef0;
              }

              .filter-buttons {
                  display: flex;
                  gap: 8px;
              }

              .filter-buttons .btn {
                  padding: 4px 12px;
                  font-size: 12px;
              }

              .filter-group .filter-field {
                  margin-bottom: 8px;
              }

              .filter-group .remove-filter {
                  color: #dc2626;
              }
              
              .loading-message {
                  margin-top: 10px;
                  color: #4a5568;
                  font-style: italic;
              }
          `;
          document.head.appendChild(styleSheet);
      }
  },

  setup_filters: function(frm) {
      if (!frm.filter_wrapper) {
          frm.filter_wrapper = $('<div class="filter-section">');
          let recipients_field = frm.get_field('recipients');
          if (recipients_field && recipients_field.wrapper) {
              frm.filter_wrapper.insertBefore(recipients_field.wrapper);
          }
      }
      
      if (frm.doc.select_doctype) {
          frm.trigger('select_doctype');
      }
  },

  select_doctype: function(frm) {
      if (!frm.doc.select_doctype) return;

      frm.filter_wrapper.empty();

      frappe.model.with_doctype(frm.doc.select_doctype, () => {
          let filter_area = $('<div class="filter-area">').appendTo(frm.filter_wrapper);
          
          frm.filter_group = new frappe.ui.FilterGroup({
              parent: filter_area,
              doctype: frm.doc.select_doctype,
              on_change: function() {
                  frm.filter_list = this.get_filters();
              }
          });

          let filter_toolbar = $('<div class="filter-toolbar">').appendTo(frm.filter_wrapper);
          let loading_message = $('<div class="loading-message">').hide().appendTo(frm.filter_wrapper);
          
          let buttons = $(`
              <div class="filter-buttons">
                  <button class="btn btn-xs btn-primary apply-filters">Apply</button>
              </div>
          `).appendTo(filter_toolbar);

          buttons.find('.apply-filters').on('click', () => {
              if (!frm.filter_list?.length) {
                  frappe.msgprint('Please set at least one filter');
                  return;
              }

              loading_message.html('Finding recipients...').show();

              frappe.call({
                  method: 'apply_filters_and_get_recipients',
                  doc: frm.doc,
                  args: { filters: frm.filter_list },
                  freeze: true,
                  freeze_message: 'Finding recipients...',
                  callback: function(r) {
                      loading_message.hide();
                      if (!r.message) return;
                      
                      frm.clear_table('recipients');
                      r.message.forEach(recipient => {
                          let row = frm.add_child('recipients');
                          row.whatsapp_number = recipient.whatsapp_number;
                          row.person_name = recipient.person_name;
                      });
                      frm.refresh_field('recipients');
                      frappe.show_alert('Recipients updated', 5);
                  }
              });
          });

          frm.filter_group.add_filter(frm.doc.select_doctype, '', '=', '');
      });
  }
});