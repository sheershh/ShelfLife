// User: an account. Saved foods are stored on the user as a list of food slugs; when each was bought,
// the shopping list and the used / wasted log live here too.
import mongoose from 'mongoose'

export const ROLES = ['user', 'admin']

export const OUTCOMES = ['used', 'wasted']

// Daily targets for the nutrition diary. Used until the person sets their own.
export const DEFAULT_GOALS = { calories: 2000, carbs: 250, fat: 65, protein: 50 }
export const FOOD_LOG_LIMIT = 500 // only the newest entries are kept

// When a saved food was bought and where it is kept: this drives the use-by countdown.
const detailSchema = new mongoose.Schema(
  {
    foodId: { type: String, required: true },
    boughtOn: { type: Date, required: true },
    storage: { type: String, required: true },
  },
  { _id: false },
)

const shoppingItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  foodId: { type: String, default: null }, // set when the item is a food from the guide
})

const logEntrySchema = new mongoose.Schema(
  {
    foodId: { type: String, required: true },
    name: { type: String, required: true },
    outcome: { type: String, enum: OUTCOMES, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
)

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    // `unique` creates a unique index, so MongoDB itself rejects a second account with the same email.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    // `select: false` means queries leave the hash out unless we explicitly ask for it (only login does).
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'user' },
    savedFoods: { type: [String], default: [] },
    savedDetails: { type: [detailSchema], default: [] },
    shopping: { type: [shoppingItemSchema], default: [] },
    foodLog: { type: [logEntrySchema], default: [] },
    goals: {
      calories: { type: Number, min: 500, max: 10000 },
      carbs: { type: Number, min: 0, max: 1500 },
      fat: { type: Number, min: 0, max: 600 },
      protein: { type: Number, min: 0, max: 600 },
    },
  },
  { timestamps: true },
)

export const User = mongoose.model('User', userSchema)

// The safe shape to send to the browser (never includes the password hash).
export const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
})
