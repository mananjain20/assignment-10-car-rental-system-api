const supabase = require('../config/supabase');

const VALID_CATEGORIES = ['Sedan', 'SUV', 'Luxury', 'Hatchback', 'Electric'];
const VALID_STATUSES = ['available', 'rented', 'maintenance'];

/**
 * Get all vehicles (Public)
 * GET /api/vehicles
 */
const getAllVehicles = async (req, res, next) => {
  try {
    const { category, status, fuel_type, brand } = req.query;

    let query = supabase.from('vehicles').select('*');

    if (category) {
      query = query.eq('category', category);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (fuel_type) {
      query = query.eq('fuel_type', fuel_type);
    }
    if (brand) {
      query = query.ilike('brand', `%${brand}%`);
    }

    query = query.order('id', { ascending: true });

    const { data: vehicles, error } = await query;

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      count: vehicles.length,
      data: vehicles
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get vehicle by ID with rental history (Public)
 * GET /api/vehicles/:id
 */
const getVehicleById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .select('*, rentals(*)')
      .eq('id', id)
      .single();

    if (error || !vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found.'
      });
    }

    return res.status(200).json({
      success: true,
      data: vehicle
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Add a new vehicle (Authenticated)
 * POST /api/vehicles
 */
const createVehicle = async (req, res, next) => {
  try {
    const {
      brand,
      model,
      year,
      category,
      daily_rate,
      fuel_type,
      seating_capacity,
      status
    } = req.body;

    if (!brand || !model || !year || !category || !daily_rate || !fuel_type || !seating_capacity) {
      return res.status(400).json({
        success: false,
        error: 'All fields (brand, model, year, category, daily_rate, fuel_type, seating_capacity) are required.'
      });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`
      });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
      });
    }

    if (Number(daily_rate) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'daily_rate must be a positive number.'
      });
    }

    if (Number(seating_capacity) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'seating_capacity must be a positive integer.'
      });
    }

    const newVehicle = {
      brand,
      model,
      year: Number(year),
      category,
      daily_rate: Number(daily_rate),
      fuel_type,
      seating_capacity: Number(seating_capacity),
      status: status || 'available'
    };

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .insert([newVehicle])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(201).json({
      success: true,
      message: 'Vehicle added successfully.',
      data: vehicle
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Update vehicle status and daily_rate (Authenticated)
 * PUT /api/vehicles/:id
 */
const updateVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { daily_rate, status } = req.body;

    // Check if vehicle exists first
    const { data: existingVehicle, error: fetchErr } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !existingVehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found.'
      });
    }

    const updates = {};

    if (daily_rate !== undefined) {
      if (Number(daily_rate) <= 0) {
        return res.status(400).json({
          success: false,
          error: 'daily_rate must be a positive number.'
        });
      }
      updates.daily_rate = Number(daily_rate);
    }

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
        });
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid update fields provided (allowed: daily_rate, status).'
      });
    }

    const { data: updatedVehicle, error: updateErr } = await supabase
      .from('vehicles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      return res.status(400).json({ success: false, error: updateErr.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Vehicle updated successfully.',
      data: updatedVehicle
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete a vehicle (Authenticated)
 * DELETE /api/vehicles/:id
 */
const deleteVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if vehicle exists
    const { data: vehicle, error: fetchErr } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found.'
      });
    }

    // Check for active or booked rentals associated with this vehicle
    const { data: activeRentals, error: rentalErr } = await supabase
      .from('rentals')
      .select('id, status')
      .eq('vehicle_id', id)
      .in('status', ['booked', 'active']);

    if (rentalErr) {
      return res.status(400).json({ success: false, error: rentalErr.message });
    }

    if (activeRentals && activeRentals.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete vehicle with active or upcoming bookings.'
      });
    }

    const { error: deleteErr } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      return res.status(400).json({ success: false, error: deleteErr.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Vehicle deleted successfully.'
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle
};
