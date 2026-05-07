import { v4 } from "uuid"; // generates a unique ID for each assignment
import { OrderStatus } from "../Utils/constants.mjs"; // status constants shared across order-related models
import DeliveryAssignmentRepository from "../Database/DeliveryAssignmentRepository.mjs"; // persists assignments to the DB
import OrderRepository from "../Database/OrderRepository.mjs"; // keeps the related order status in sync

const repository = new DeliveryAssignmentRepository(); // single repository instance reused across all static calls
const orderRepository = new OrderRepository();

export default class DeliveryAssignment {
  constructor(orderId, courierId) {
    this.assignmentId = v4(); // unique identifier for this assignment
    this.orderId = orderId; // links the assignment to the order being delivered
    this.courierId = courierId; // links the assignment to the courrier who will deliver it
    this.status = OrderStatus.PREPARING; // newly assigned deliveries start in Preparing
  }

  // creates a new assignment, persists it, and returns the instance
  static async create(orderId, courierId) {
    const assignment = new DeliveryAssignment(orderId, courierId); // builds the instance with a fresh uuid
    await repository.createAssignment(
      assignment.assignmentId,
      assignment.orderId,
      assignment.courierId,
      assignment.status,
    );
    return assignment; // returns the persisted instance to the caller
  }

  // updates both the assignment and the linked order so every dashboard shows the same state
  static async updateStatus(assignmentId, newStatus) {
    const assignment = await repository.findById(assignmentId);
    if (!assignment) throw new Error("Delivery assignment not found");

    await repository.updateStatus(assignmentId, newStatus);
    await orderRepository.updateStatus(assignment.orderId, newStatus);
  }
}
