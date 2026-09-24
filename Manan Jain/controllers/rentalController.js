const supabase = require('../config/supabase');

/**
 * Helper to calculate rental days between start_date and end_date
 */
const calculateRentalDays = (startDateStr, endDateStr) => {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  const diffInMs = end.getTime() - start.getTime();
  const diffInDays = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));

  // Same day rental counts as 1 day
  return diffInDays === 0 ? 1 : diffInDays;
};

/**
 * Book a vehicle
 * POST /api/rentals
 */
const createRental = async (req, res, next) => {
  try {
    const { vehicle_id, start_date, end_date, customer_name, customer_email } = req.body;

    // 1. Basic validation
    if (!vehicle_id || !start_date || !end_date || !customer_name || !customer_email) {
      return res.status(400).json({
        success: false,
        error: 'vehicle_id, start_date, end_date, customer_name, and customer_email are required.'
      });
    }

    const start = new Date(start_date);
    const end = new Date(end_date);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format provided for start_date or end_date.'
      });
    }

    if (end < start) {
      return res.status(400).json({
        success: false,
        error: 'end_date must be greater than or equal to start_date.'
      });
    }

    // 2. Verify vehicle exists
    const { data: vehicle, error: vehicleErr } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', vehicle_id)
      .single();

    if (vehicleErr || !vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found.'
      });
    }

    // 3. Verify vehicle availability status
    if (vehicle.status === 'maintenance') {
      return res.status(400).json({
        success: false,
        error: 'Vehicle is currently under maintenance and unavailable for booking.'
      });
    }

    // 4. Check for date range collisions (Date Collision Prevention)
    // Overlap logic: existing.start_date <= requested.end_date AND existing.end_date >= requested.start_date
    const { data: existingRentals, error: overlapErr } = await supabase
      .from('rentals')
      .select('*')
      .eq('vehicle_id', vehicle_id)
      .neq('status', 'cancelled')
      .lte('start_date', end_date)
      .gte('end_date', start_date);

    if (overlapErr) {
      return res.status(400).json({ success: false, error: overlapErr.message });
    }

    if (existingRentals && existingRentals.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Vehicle is already reserved during the requested timeframe.'
      });
    }

    // 5. Calculate duration and total cost
    const rentalDays = calculateRentalDays(start_date, end_date);
    const total_cost = rentalDays * Number(vehicle.daily_rate);

    // 6. Create rental record in Supabase
    const newRental = {
      user_id: req.user.id,
      vehicle_id,
      customer_name,
      customer_email,
      start_date,
      end_date,
      total_cost,
      status: 'booked'
    };

    const { data: rental, error: insertErr } = await supabase
      .from('rentals')
      .insert([newRental])
      .select('*, vehicles(*)')
      .single();

    if (insertErr) {
      return res.status(400).json({ success: false, error: insertErr.message });
    }

    return res.status(201).json({
      success: true,
      message: 'Vehicle booked successfully.',
      rental_days: rentalDays,
      data: rental
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get user's own bookings
 * GET /api/rentals/my-bookings
 */
const getMyBookings = async (req, res, next) => {
  try {
    const { data: rentals, error } = await supabase
      .from('rentals')
      .select('*, vehicles(*)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      count: rentals.length,
      data: rentals
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Cancel an upcoming rental
 * PATCH /api/rentals/:id/cancel
 */
const cancelRental = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch rental record
    const { data: rental, error: fetchErr } = await supabase
      .from('rentals')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !rental) {
      return res.status(404).json({
        success: false,
        error: 'Rental booking not found.'
      });
    }

    // Ensure rental belongs to authenticated user
    if (rental.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. You can only cancel your own bookings.'
      });
    }

    if (rental.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Rental booking is already cancelled.'
      });
    }

    if (rental.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Completed rentals cannot be cancelled.'
      });
    }

    // Update rental status to cancelled
    const { data: updatedRental, error: updateErr } = await supabase
      .from('rentals')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      return res.status(400).json({ success: false, error: updateErr.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Rental booking cancelled successfully.',
      data: updatedRental
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Complete a rental
 * PATCH /api/rentals/:id/complete
 */
const completeRental = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch rental record
    const { data: rental, error: fetchErr } = await supabase
      .from('rentals')
      .select('*, vehicles(*)')
      .eq('id', id)
      .single();

    if (fetchErr || !rental) {
      return res.status(404).json({
        success: false,
        error: 'Rental booking not found.'
      });
    }

    // Ensure rental belongs to authenticated user
    if (rental.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. You can only manage your own rentals.'
      });
    }

    if (rental.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Cannot complete a cancelled rental.'
      });
    }

    if (rental.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Rental is already completed.'
      });
    }

    // Update rental status to completed
    const { data: updatedRental, error: updateErr } = await supabase
      .from('rentals')
      .update({ status: 'completed' })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      return res.status(400).json({ success: false, error: updateErr.message });
    }

    // Vehicle Status Management:
    // If vehicle status is not 'maintenance', reset back to 'available'
    const currentVehicle = rental.vehicles;
    if (currentVehicle && currentVehicle.status !== 'maintenance') {
      await supabase
        .from('vehicles')
        .update({ status: 'available' })
        .eq('id', rental.vehicle_id);
    }

    return res.status(200).json({
      success: true,
      message: 'Rental completed successfully. Vehicle status updated to available.',
      data: updatedRental
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createRental,
  getMyBookings,
  cancelRental,
  completeRental
};
