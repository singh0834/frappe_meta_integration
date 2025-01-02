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

frappe.ui.form.on('WhatsApp Campaign', {
  setup: function(frm) {
      frappe.dom.set_style(`
          .filter-section {
              padding: 15px;
              margin: 10px 0;
              border: 1px solid var(--border-color);
              border-radius: var(--border-radius);
          }
          .filter-section .filter-box {
              margin: 10px 0;
          }
          .filter-section .btn-remove {
              padding: 3px 5px;
              margin-left: 10px;
          }
          .filter-section .filter-field {
              display: flex;
              align-items: center;
              gap: 10px;
          }
          .filter-actions {
              display: flex;
              gap: 10px; /* Ensures buttons are spaced out */
              align-items: center; /* Vertically align buttons */
          }
          .filter-actions button {
              padding: 4px 8px;
              font-size: 12px; /* Ensure buttons are not too large */
          }
      `);
  },

  refresh: function(frm) {
      frm.trigger('setup_filters');
  },

  setup_filters: function(frm) {
      if (!frm.filter_wrapper) {
          frm.filter_wrapper = $('<div class="filter-section">').insertBefore(
              frm.get_field('recipients').wrapper
          );
      }
  },

  custom_select_doctype: function(frm) {
      if (frm.doc.custom_select_doctype) {
          if (frm.filter_wrapper) {
              frm.filter_wrapper.empty();
          }

          frappe.model.with_doctype(frm.doc.custom_select_doctype, () => {
              // Initialize filter group
              frm.filter_group = new frappe.ui.FilterGroup({
                  parent: frm.filter_wrapper,
                  doctype: frm.doc.custom_select_doctype,
                  on_change: function() {
                      frm.filter_list = frm.filter_group.get_filters();
                  }
              });

              // Extend FilterGroup functionality
              frm.filter_group.make = function() {
                  this._super();

                  // Show the remove button
                  this.wrapper.find('.btn-remove').show();

                  // Add Apply Filters button next to Clear Filters
                  let filter_actions = this.wrapper.find('.filter-actions');
                  if (!filter_actions.length) {
                      filter_actions = $('<div class="filter-actions">').appendTo(this.wrapper);
                  }

                  // Remove existing Clear Filters button
                  this.wrapper.find('.clear-filters').remove();

                  // Add both buttons with icons
                  $(`
                      <button class="btn btn-default btn-sm clear-filters" title="Clear Filters">
                          <span class="filtername">Clear Filters</span>
                      </button>
                      <button class="btn btn-default btn-sm apply-filters" title="Apply Filters">
                          <span class="filtername">Apply Filters</span>
                      </button>
                  `).appendTo(filter_actions);

                  // Handle Clear Filters click
                  filter_actions.find('.clear-filters').on('click', () => {
                      this.clear();
                      frm.filter_list = [];
                  });

                  // Handle Apply Filters click
                  filter_actions.find('.apply-filters').on('click', () => {
                      if (!frm.filter_list || !frm.filter_list.length) {
                          frappe.msgprint('Please set at least one filter');
                          return;
                      }

                      frappe.call({
                          method: 'apply_filters_and_get_recipients',
                          doc: frm.doc,
                          args: {
                              filters: frm.filter_list
                          },
                          freeze: true,
                          freeze_message: 'Fetching Recipients...',
                          callback: function(r) {
                              if (r.message) {
                                  frm.clear_table('recipients');
                                  r.message.forEach(recipient => {
                                      let row = frm.add_child('recipients');
                                      row.whatsapp_number = recipient.whatsapp_number;
                                      row.person_name = recipient.person_name;
                                  });
                                  frm.refresh_field('recipients');
                                  frappe.show_alert({
                                      message: 'Recipients updated successfully',
                                      indicator: 'green'
                                  });
                              }
                          }
                      });
                  });

                  // Ensure Apply Filters button is visible and styled similarly to Clear Filters
                  filter_actions.find('.apply-filters').show();
                  
                  this.get_doctype_fields = function() {
                      let fields = [];
                      let meta = frappe.get_meta(this.doctype);

                      meta.fields.forEach(df => {
                          if (!['Section Break', 'Column Break', 'HTML', 'Button'].includes(df.fieldtype)) {
                              fields.push({
                                  label: `${df.label || df.fieldname}`,
                                  fieldname: df.fieldname,
                                  fieldtype: df.fieldtype,
                                  options: df.options,
                              });
                          }
                      });

                      return fields;
                  };
              };

              // Override get_filter to ensure value field is shown
              frm.filter_group.get_filter = function(doctype, fieldname) {
                  let filter = this._super(doctype, fieldname);
                  
                  if (filter) {
                      setTimeout(() => {
                          filter.$filter_field_area.show();
                          filter.make_field();
                      }, 100);
                  }
                  
                  return filter;
              };

              // Add default empty filter
              frm.filter_group.add_filter(frm.doc.custom_select_doctype, '', '=', '');
              frm.filter_group.show();
          });
      }
  }
});

