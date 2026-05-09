import { v4 } from "uuid"; // generates a unique ID for each new order
import OrderRepository from "../Database/OrderRepository.mjs"; // persists orders and their items
import { errorController } from "./ErrorController.mjs"; // sends error pages on failure
import { HTTP_STATUS, OrderStatus, OrderLimits, UserRoles } from "../Utils/constants.mjs"; // status constants and business rule limits
import { parseBody } from "../Utils/bodyParser.mjs"; // reads and decodes the POST request body
import { verifyToken } from "../Utils/token.mjs"; // reads the JWT cookie to identify the logged-in customer
import { renderHTML } from "../Utils/renderHTML.mjs"; // renders an HTML template with injected data

const repository = new OrderRepository(); // single repository instance reused across all handlers

export const orderController = {
  // handles POST /cart/add — adds one item to the customer's in-progress cart for a restaurant
  addToCart: async (req, res) => {
    try {
      const { userId } = await verifyToken(req, UserRoles.CUSTOMER);
      const { restaurantId, itemName, itemPrice } = await parseBody(req);
      let cartOrder = await repository.findCartOrder(userId, restaurantId);
      if (!cartOrder) {
        const activeOrders = await repository.findActiveByCustomerId(userId);
        if (activeOrders.length >= OrderLimits.MAX_ACTIVE_ORDERS) {
          return errorController(HTTP_STATUS.BAD_REQUEST, req, res);
        }
        const orderId = v4();
        await repository.createOrder(orderId, userId, restaurantId, OrderStatus.INCOMPLETE);
        cartOrder = { orderId };
      }
      await repository.addOrderItem(cartOrder.orderId, itemName, Number(itemPrice));
      res.writeHead(HTTP_STATUS.SEE_OTHER, { Location: `/restaurant/menu?id=${restaurantId}` });
      res.end();
    } catch {
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },

  // handles POST /order/create — submits the customer's existing cart for this restaurant
  create: async (req, res) => {
    try {
      const { userId } = await verifyToken(req, UserRoles.CUSTOMER);
      const { restaurantId } = await parseBody(req);
      const cartOrder = await repository.findCartOrder(userId, restaurantId);
      if (!cartOrder) return errorController(HTTP_STATUS.BAD_REQUEST, req, res);
      await repository.updateStatus(cartOrder.orderId, OrderStatus.SUBMITTED);
      res.writeHead(HTTP_STATUS.SEE_OTHER, { Location: `/order?id=${cartOrder.orderId}` });
      res.end();
    } catch {
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },

  // handles GET /order?id=... — renders the order detail page for the logged-in customer
  view: async (req, res) => {
    try {
      await verifyToken(req, UserRoles.CUSTOMER);
      const url = new URL(req.url, `http://${req.headers.host}`); // parses the URL to extract query params
      const orderId = url.searchParams.get("id"); // reads the order ID from the ?id= query string
      const order = await repository.findById(orderId); // fetches the order row from the DB
      if (!order) return errorController(HTTP_STATUS.NOT_FOUND, req, res); // sends 404 if the order doesn't exist
      const items = await repository.findItemsByOrderId(orderId); // fetches all items belonging to this order
      const orderItems = items.length
        ? items.map(i => `<li>${i.itemName} — $${i.price}</li>`).join("") // builds the item list HTML
        : "<li class='empty'>No items in this order.</li>"; // fallback when the order has no items yet
      const totalPrice = items.reduce((sum, i) => sum + Number(i.price), 0).toFixed(2); // sums item prices to two decimals
      await renderHTML(res, "Customer-OrderView.html", {
        orderId: order.orderId, // injected into {{orderId}} in the view
        orderStatus: order.status, // injected into {{orderStatus}} in the view
        orderItems, // injected into {{orderItems}} in the view
        totalPrice, // injected into {{totalPrice}} in the view
      });
    } catch {
      errorController(HTTP_STATUS.UNAUTHORIZED, req, res); // sends 401 if token is missing or expired
    }
  },

  // handles GET /orders — lists all orders placed by the logged-in customer
  list: async (req, res) => {
    try {
      const { userId } = await verifyToken(req, UserRoles.CUSTOMER);
      const orders = await repository.findByCustomerId(userId); // fetches all orders for this customer
      
      // exclude incomplete carts from the list
      const filteredOrders = orders.filter(o => o.status !== OrderStatus.INCOMPLETE);
      
      const ordersList = filteredOrders.length
        ? (await Promise.all(
            filteredOrders.map(async (order) => {
              const items = await repository.findItemsByOrderId(order.orderId);
              const totalPrice = items.reduce((sum, i) => sum + Number(i.price), 0).toFixed(2);
              return `<div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <h3 style="margin: 0;">Order <span style="color:#999; font-weight:400; font-size:0.95rem;">#${order.orderId}</span></h3>
                    <p style="margin: 0.5rem 0 0 0; color:#666; font-size:0.9rem;">${items.length} item${items.length !== 1 ? 's' : ''} — $${totalPrice}</p>
                  </div>
                  <div style="text-align: right;">
                    <span class="badge">${order.status}</span>
                    <br>
                    <a href="/order?id=${order.orderId}" style="color:#00ccbc; text-decoration:none; font-size:0.9rem; margin-top:0.5rem; display:block;">View Details →</a>
                  </div>
                </div>
              </div>`;
            })
          )).join("")
        : "<div class='card'><p style='color:#999; text-align:center;'>No orders yet. <a href='/home' style='color:#00ccbc;'>Browse restaurants</a></p></div>";
      
      await renderHTML(res, "Customer-OrdersListView.html", {
        ordersList,
      });
    } catch {
      errorController(HTTP_STATUS.UNAUTHORIZED, req, res);
    }
  },

  // handles POST /order/cancel — cancels an existing order if it has not yet been picked up
  cancel: async (req, res) => {
    try {
      const { userId } = await verifyToken(req, UserRoles.CUSTOMER); // confirms the customer is authenticated and reads their ID
      const { orderId } = await parseBody(req); // reads the order ID from the hidden form field
      const order = await repository.findById(orderId); // fetches the order to verify ownership and current status
      if (!order) return errorController(HTTP_STATUS.NOT_FOUND, req, res); // sends 404 if the order doesn't exist
      if (order.customerId !== userId) return errorController(HTTP_STATUS.UNAUTHORIZED, req, res); // prevents cancelling another customer's order
      if (order.status === OrderStatus.ONTHEWAY || order.status === OrderStatus.DELIVERED) { // can't cancel once a courrier has picked it up
        return errorController(HTTP_STATUS.BAD_REQUEST, req, res);
      }
      await repository.updateStatus(orderId, OrderStatus.INCOMPLETE); // marks the order as Incomplete Cart (cancelled)
      res.writeHead(HTTP_STATUS.SEE_OTHER, { Location: "/home" }); // redirects back to the customer home page
      res.end();
    } catch {
      errorController(HTTP_STATUS.SERVER_ERROR, req, res); // sends 500 if anything goes wrong
    }
  },
};
